#define TINY_GSM_MODEM_SIM7600

#include <TinyGsmClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <RTClib.h>
#include <PCF8575.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>
#include <esp_task_wdt.h>

#define WDT_TIMEOUT_S 120

#define GSM_RX    27
#define GSM_TX    26
#define GSM_BAUD  115200
#define APN       "dialogbb"

// Firebase Realtime Database settings.
// Keep your current DB secret here, or replace it with the new one if you rotate it.
#define FIREBASE_HOST "smartdose-dcd88-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "CZnwewbitQSo2RY8CvP6nf0lHbX4fAgwS7dZAKMi"
#define DB_PATH       "/smartdose"

#define RGB_R     19
#define RGB_G     18
#define RGB_B     23
#define BUZZER    32
#define BUTTON    33
#define SERVO_PIN 2

#define DOOR_OPEN_ANGLE   50
#define DOOR_CLOSE_ANGLE  175

#define STEPS_PER_PILL    500
#define STEP_DELAY_MS     2
#define DISPENSE_DELAY_MS 3000

// Real app mode: medication times come from the app/Firebase.
#define DEMO_MODE false

#define COMMAND_INTERVAL_MS       15000UL
#define DEVICE_STATUS_INTERVAL_MS 60000UL
#define MED_SYNC_INTERVAL_MS      300000UL
#define MISSED_WINDOW_MS          300000UL
#define DOOR_AUTO_CLOSE_MS        120000UL

RTC_DS3231 rtc;
PCF8575 pcf(0x20);
LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo doorServo;

HardwareSerial gsmSerial(2);
TinyGsm modem(gsmSerial);

int stepSeq[4][4] = {
  {1, 1, 0, 0},
  {0, 1, 1, 0},
  {0, 0, 1, 1},
  {1, 0, 0, 1}
};

struct MedSlot {
  String id;
  String name;
  int hour;
  int minute;
  int compartment;
  int pillCount;
  bool active;
  bool triggered;
  bool waitingConfirm;
  unsigned long alertStartTime;
};

MedSlot slots[10];
int slotCount = 0;
bool doorOpen = false;
int currentDoseIndex = -1;

int demoHour = -1;
int demoMinute = -1;

unsigned long lastCmd = 0;
unsigned long lastMedSync = 0;
unsigned long lastDeviceStatus = 0;

volatile bool buttonPressed = false;
volatile unsigned long lastButtonIsrMs = 0;
#define BUTTON_DEBOUNCE_MS 200

void IRAM_ATTR handleButton() {
  unsigned long now = millis();
  if (now - lastButtonIsrMs < BUTTON_DEBOUNCE_MS) return;
  lastButtonIsrMs = now;
  buttonPressed = true;
}

void connectGSM();
String firebaseGet(String path);
int  firebasePut(String path, String jsonBody);
void fetchMedications();
void checkCommands();
void updateDeviceStatus(bool connected = true);
void logHistory(String medName, int comp, String status);
void checkMedicationTimes(DateTime now);
void checkMissedDoses();
void dispensePills(int compartment, int count);
void lcdPrint(String line1, String line2);
void buzzerAlert(int beeps);
String pad(int n);
void setRGB(bool r, bool g, bool b);
void openDoor();
void closeDoor();
void sendDoseNotification(String medName, String status);
void handleDoorAutoClose();
void handleSerialCommand(String cmd);
void runMotorTest(int compartment, int rotations, bool clockwise);

String pad(int n) {
  return (n < 10 ? "0" : "") + String(n);
}

void setRGB(bool r, bool g, bool b) {
  digitalWrite(RGB_R, r ? LOW : HIGH);
  digitalWrite(RGB_G, g ? LOW : HIGH);
  digitalWrite(RGB_B, b ? LOW : HIGH);
}

void lcdPrint(String line1, String line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

void buzzerAlert(int beeps) {
  for (int i = 0; i < beeps; i++) {
    digitalWrite(BUZZER, HIGH);
    delay(300);
    digitalWrite(BUZZER, LOW);
    delay(200);
  }
}

void openDoor() {
  doorServo.write(DOOR_OPEN_ANGLE);
  doorOpen = true;
}

void closeDoor() {
  doorServo.write(DOOR_CLOSE_ANGLE);
  doorOpen = false;
}

void computeDemoTime() {
  DateTime t = rtc.now();
  demoHour = t.hour();
  demoMinute = t.minute();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  const esp_task_wdt_config_t wdt_cfg = {
    .timeout_ms = WDT_TIMEOUT_S * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  if (esp_task_wdt_init(&wdt_cfg) == ESP_ERR_INVALID_STATE) {
    esp_task_wdt_reconfigure(&wdt_cfg);
  }
  esp_task_wdt_add(NULL);

  pinMode(RGB_R, OUTPUT);
  pinMode(RGB_G, OUTPUT);
  pinMode(RGB_B, OUTPUT);
  setRGB(1, 0, 0);

  pinMode(BUZZER, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);
  attachInterrupt(BUTTON, handleButton, FALLING);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcdPrint("SmartDose", "Starting...");

  pcf.begin();
  pcf.write16(0x0000);

  doorServo.attach(SERVO_PIN, 500, 2500);
  closeDoor();

  if (!rtc.begin()) {
    Serial.println("RTC FAIL");
    lcdPrint("RTC Error!", "Check wiring");
    setRGB(1, 0, 0);
  } else {
    Serial.println("RTC OK");
    if (rtc.lostPower()) {
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }
  }

  setRGB(0, 0, 1);
  connectGSM();

  if (DEMO_MODE) computeDemoTime();

  fetchMedications();
  updateDeviceStatus(true);

  setRGB(0, 1, 0);
  buzzerAlert(2);
  lcdPrint("SmartDose", "Ready!");

  lastCmd = millis();
  lastMedSync = millis();
  lastDeviceStatus = millis();
}

void loop() {
  esp_task_wdt_reset();

  DateTime now = rtc.now();
  String timeStr = pad(now.hour()) + ":" + pad(now.minute());
  String dateStr = pad(now.day()) + "/" + pad(now.month()) + "/" + pad(now.year() % 100);

  if (!doorOpen) {
    if (currentDoseIndex >= 0 && slots[currentDoseIndex].waitingConfirm) {
      lcdPrint(slots[currentDoseIndex].name, "Press dispense");
    } else {
      lcdPrint("SD " + timeStr + " " + dateStr, "Running...");
    }
  }

  if (buttonPressed) {
    buttonPressed = false;
    Serial.println("BUTTON PRESSED");

    if (currentDoseIndex >= 0) {
      lcdPrint("Door Opening", "Please wait...");
      openDoor();
      buzzerAlert(2);
      delay(DISPENSE_DELAY_MS);
      setRGB(0, 0, 1);

      String pendingNames[10];
      int pendingComps[10];
      int pendingCount = 0;

      for (int i = 0; i < slotCount; i++) {
        if (!slots[i].waitingConfirm) continue;

        lcdPrint("Dispensing...", "Please Wait");
        Serial.println("Dispensing: " + slots[i].name);
        dispensePills(slots[i].compartment, slots[i].pillCount);

        pendingNames[pendingCount] = slots[i].name;
        pendingComps[pendingCount] = slots[i].compartment;
        pendingCount++;

        slots[i].waitingConfirm = false;
        slots[i].triggered = true;
      }

      lcdPrint("Dose Taken!", "Well done!");
      setRGB(0, 1, 0);
      currentDoseIndex = -1;
      handleDoorAutoClose();

      if (pendingCount > 0) {
        lcdPrint("Syncing...", "Cloud update");
        setRGB(0, 0, 1);
        for (int i = 0; i < pendingCount; i++) {
          logHistory(pendingNames[i], pendingComps[i], "taken");
          sendDoseNotification(pendingNames[i], "taken");
        }
        updateDeviceStatus(true);
        setRGB(0, 1, 0);
        lcdPrint("SmartDose", "Ready!");
      }
    }
  }

  if (currentDoseIndex < 0) {
    if (millis() - lastCmd > COMMAND_INTERVAL_MS) {
      checkCommands();
      lastCmd = millis();
    }

    if (millis() - lastMedSync > MED_SYNC_INTERVAL_MS) {
      fetchMedications();
      lastMedSync = millis();
    }

    if (millis() - lastDeviceStatus > DEVICE_STATUS_INTERVAL_MS) {
      updateDeviceStatus(true);
      lastDeviceStatus = millis();
    }
  }

  checkMedicationTimes(rtc.now());
  checkMissedDoses();

  if (currentDoseIndex >= 0 && slots[currentDoseIndex].waitingConfirm) {
    static unsigned long lastBeep = 0;
    if (millis() - lastBeep > 30000) {
      buzzerAlert(2);
      setRGB(1, 1, 0);
      delay(200);
      setRGB(1, 0, 0);
      lastBeep = millis();
    }
  }

  static int lastDay = -1;
  if (now.day() != lastDay) {
    if (lastDay != -1) {
      for (int i = 0; i < slotCount; i++) {
        slots[i].triggered = false;
        slots[i].waitingConfirm = false;
      }
      currentDoseIndex = -1;
      Serial.println("Daily reset done.");
    }
    lastDay = now.day();
  }

  for (int d = 0; d < 60; d++) {
    delay(50);
    if (buttonPressed) break;
    if (Serial.available()) {
      String cmd = Serial.readStringUntil('\n');
      handleSerialCommand(cmd);
      break;
    }
  }
}

void handleDoorAutoClose() {
  unsigned long doorOpenTime = millis();
  while (millis() - doorOpenTime < DOOR_AUTO_CLOSE_MS) {
    esp_task_wdt_reset();
    int remaining = (DOOR_AUTO_CLOSE_MS - (millis() - doorOpenTime)) / 1000;
    lcdPrint("Door Open", "Close in " + String(remaining) + "s");
    delay(500);
    if (buttonPressed) {
      buttonPressed = false;
      break;
    }
  }
  lcdPrint("Door Closing", "Please wait...");
  closeDoor();
  buzzerAlert(1);
  setRGB(0, 1, 0);
  lcdPrint("SmartDose", "Ready!");
}

void checkMedicationTimes(DateTime now) {
  bool anyNew = false;

  static bool demoFired = false;
  if (DEMO_MODE && !demoFired && slotCount > 0) {
    for (int i = 0; i < slotCount; i++) {
      if (!slots[i].active || slots[i].triggered) continue;
      slots[i].waitingConfirm = true;
      slots[i].alertStartTime = millis();
      if (!anyNew) {
        currentDoseIndex = i;
        anyNew = true;
      }
    }
    demoFired = true;
  } else if (!DEMO_MODE) {
    for (int i = 0; i < slotCount; i++) {
      if (!slots[i].triggered &&
          !slots[i].waitingConfirm &&
          slots[i].active &&
          now.hour() == slots[i].hour &&
          now.minute() == slots[i].minute) {
        slots[i].waitingConfirm = true;
        slots[i].alertStartTime = millis();
        Serial.println("Alert: " + slots[i].name);
        if (!anyNew) {
          currentDoseIndex = i;
          anyNew = true;
        }
      }
    }
  }

  if (anyNew) {
    setRGB(1, 0, 0);
    buzzerAlert(3);
    Serial.println("Waiting for button...");
  }
}

void checkMissedDoses() {
  String missedNames[10];
  int missedComps[10];
  int missedCount = 0;

  for (int i = 0; i < slotCount; i++) {
    if (!slots[i].waitingConfirm) continue;
    if (millis() - slots[i].alertStartTime <= MISSED_WINDOW_MS) continue;

    missedNames[missedCount] = slots[i].name;
    missedComps[missedCount] = slots[i].compartment;
    missedCount++;

    slots[i].waitingConfirm = false;
    slots[i].triggered = true;
  }

  if (missedCount == 0) return;

  lcdPrint("Time's up!", "Missed: " + missedNames[0]);
  buzzerAlert(3);
  for (int f = 0; f < 6; f++) {
    setRGB(1, 0, 0);
    delay(250);
    setRGB(0, 0, 0);
    delay(250);
  }

  int stillWaiting = -1;
  for (int i = 0; i < slotCount; i++) {
    if (slots[i].waitingConfirm) {
      stillWaiting = i;
      break;
    }
  }

  if (stillWaiting >= 0) {
    currentDoseIndex = stillWaiting;
    return;
  }

  currentDoseIndex = -1;
  lcdPrint("Syncing...", "Cloud update");
  setRGB(0, 0, 1);
  for (int i = 0; i < missedCount; i++) {
    logHistory(missedNames[i], missedComps[i], "missed");
    sendDoseNotification(missedNames[i], "missed");
  }
  updateDeviceStatus(true);
  setRGB(0, 1, 0);
  lcdPrint("SmartDose", "Ready!");
}

void stepMotor(int motor, int steps, bool cw) {
  int start = motor * 4;
  for (int i = 0; i < steps; i++) {
    for (int s = 0; s < 4; s++) {
      int idx = cw ? s : (3 - s);
      for (int p = 0; p < 4; p++) {
        pcf.write(start + p, stepSeq[idx][p]);
      }
      delay(STEP_DELAY_MS);
    }
    if ((i & 0xFF) == 0) esp_task_wdt_reset();
  }
  for (int p = 0; p < 4; p++) {
    pcf.write(start + p, LOW);
  }
}

void dispensePills(int compartment, int count) {
  bool cw = (compartment != 2);
  Serial.println("Motor C:" + String(compartment) + " x" + String(count));
  for (int pill = 0; pill < count; pill++) {
    stepMotor(compartment, STEPS_PER_PILL, cw);
    delay(500);
  }
}

void runMotorTest(int compartment, int rotations, bool clockwise) {
  for (int r = 0; r < rotations; r++) {
    stepMotor(compartment, STEPS_PER_PILL, clockwise);
    delay(300);
  }
}

void sendDoseNotification(String medName, String status) {
  DateTime now = rtc.now();
  String ts = pad(now.hour()) + ":" + pad(now.minute());
  String key = String(now.unixtime());
  String json = "{\"medication\":\"" + medName +
                "\",\"status\":\"" + status +
                "\",\"time\":\"" + ts +
                "\",\"read\":false}";
  firebasePut(String(DB_PATH) + "/notifications/" + key, json);
}

void connectGSM() {
  lcdPrint("GSM Init...", "Please wait");
  setRGB(0, 0, 1);

  gsmSerial.begin(GSM_BAUD, SERIAL_8N1, GSM_RX, GSM_TX);
  esp_task_wdt_reset();

  if (!modem.testAT(2000)) {
    Serial.println("Modem unresponsive, restarting...");
    modem.restart();
  } else if (!modem.init()) {
    Serial.println("Modem init failed, restarting...");
    modem.restart();
  }

  esp_task_wdt_reset();
  Serial.println("Modem: " + modem.getModemInfo());
  lcdPrint("Connecting...", "Network...");

  // Enable automatic network time sync BEFORE registering on the network
  gsmSerial.println("AT+CLTS=1");
  delay(500);
  gsmSerial.println("AT+CTZU=1");
  delay(500);
  esp_task_wdt_reset();

  bool netOk = false;
  for (int i = 0; i < 12 && !netOk; i++) {
    esp_task_wdt_reset();
    netOk = modem.waitForNetwork(5000L);
  }

  if (!netOk) {
    lcdPrint("No Network!", "Check SIM");
    setRGB(1, 0, 0);
    updateDeviceStatus(false);
    return;
  }

  esp_task_wdt_reset();
  if (!modem.gprsConnect(APN, "", "")) {
    lcdPrint("GPRS Failed!", "Check APN");
    setRGB(1, 0, 0);
    updateDeviceStatus(false);
    return;
  }

  esp_task_wdt_reset();
  lcdPrint("GSM OK!", modem.localIP().toString());
  setRGB(0, 1, 0);
  Serial.println("GPRS OK! IP: " + modem.localIP().toString());

  // Try AT+CCLK? up to 3 times — network may need a moment to provide time
  bool timeSynced = false;
  for (int attempt = 0; attempt < 3 && !timeSynced; attempt++) {
    esp_task_wdt_reset();
    delay(1500);
    gsmSerial.println("AT+CCLK?");
    delay(2000);
    String timeResp = "";
    unsigned long t = millis();
    while (millis() - t < 3000) {
      while (gsmSerial.available()) timeResp += (char)gsmSerial.read();
    }

    int idx = timeResp.indexOf("+CCLK:");
    if (idx != -1) {
      String tp = timeResp.substring(idx + 8, idx + 25);
      int yr = tp.substring(0, 2).toInt() + 2000;
      int mo = tp.substring(3, 5).toInt();
      int dy = tp.substring(6, 8).toInt();
      int hr = tp.substring(9, 11).toInt();
      int mn = tp.substring(12, 14).toInt();
      int sc = tp.substring(15, 17).toInt();

      // Sanity check: year must be 2020 or later
      if (yr >= 2020 && mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
        rtc.adjust(DateTime(yr, mo, dy, hr, mn, sc));
        lcdPrint("Time Synced!", pad(hr) + ":" + pad(mn));
        Serial.println("RTC synced: " + String(yr) + "-" + pad(mo) + "-" + pad(dy) +
                       " " + pad(hr) + ":" + pad(mn));
        timeSynced = true;
        delay(1000);
      }
    }
    if (!timeSynced) {
      Serial.println("Time sync attempt " + String(attempt + 1) + " failed, retrying...");
    }
  }

  if (!timeSynced) {
    Serial.println("Warning: RTC not synced from network. Timestamps may be inaccurate.");
    lcdPrint("Time sync fail", "Using RTC time");
    delay(1000);
  }

  // ── Firebase connectivity test ────────────────────────────────────────
  lcdPrint("Testing...", "Firebase conn");
  Serial.println("Testing Firebase connectivity...");
  int testStatus = firebasePut(String(DB_PATH) + "/ping", "{\"ping\":true}");
  if (testStatus == 200) {
    lcdPrint("Firebase OK!", "Connected");
    Serial.println("Firebase connection test PASSED.");
    delay(1500);
  } else if (testStatus == 401 || testStatus == 403) {
    lcdPrint("Firebase AUTH", "FAILED! Chk key");
    Serial.println("CRITICAL: Firebase auth failed (HTTP " + String(testStatus) + ").");
    Serial.println("Check FIREBASE_AUTH token in firmware.");
    delay(3000);
  } else {
    lcdPrint("Firebase FAIL", "HTTP:" + String(testStatus));
    Serial.println("Firebase test failed (HTTP " + String(testStatus) + "). Check network.");
    delay(2000);
  }
}

String firebaseGet(String path) {
  if (!modem.isGprsConnected()) connectGSM();

  String url = "https://" + String(FIREBASE_HOST) + path + ".json?auth=" + FIREBASE_AUTH;

  gsmSerial.println("AT+HTTPTERM"); delay(1000);
  gsmSerial.println("AT+HTTPINIT"); delay(1000);
  gsmSerial.println("AT+HTTPPARA=\"CID\",1"); delay(600);
  gsmSerial.println("AT+HTTPPARA=\"URL\",\"" + url + "\""); delay(600);
  gsmSerial.println("AT+HTTPPARA=\"CONTENT\",\"application/json\""); delay(600);
  gsmSerial.println("AT+HTTPACTION=0");

  // Wait up to 20 seconds for +HTTPACTION URC
  String response = "";
  unsigned long t = millis();
  while (millis() - t < 20000) {
    esp_task_wdt_reset();
    while (gsmSerial.available()) response += (char)gsmSerial.read();
    if (response.indexOf("+HTTPACTION:") != -1) break;
  }

  gsmSerial.println("AT+HTTPREAD=0,4000");
  String body = "";
  t = millis();
  while (millis() - t < 5000) {
    esp_task_wdt_reset();
    while (gsmSerial.available()) body += (char)gsmSerial.read();
  }

  gsmSerial.println("AT+HTTPTERM"); delay(600);

  int objStart = body.indexOf('{');
  int objEnd = body.lastIndexOf('}');
  if (objStart != -1 && objEnd != -1 && objEnd > objStart) {
    return body.substring(objStart, objEnd + 1);
  }

  int arrStart = body.indexOf('[');
  int arrEnd = body.lastIndexOf(']');
  if (arrStart != -1 && arrEnd != -1 && arrEnd > arrStart) {
    return body.substring(arrStart, arrEnd + 1);
  }

  return "";
}

// Returns HTTP status code (200 = OK, 401 = auth error, 0 = network/timeout fail)
int firebasePut(String path, String jsonBody) {
  if (!modem.isGprsConnected()) connectGSM();
  if (!modem.isGprsConnected()) {
    Serial.println("PUT FAIL: no GPRS for " + path);
    return 0;
  }

  String url = "https://" + String(FIREBASE_HOST) + path + ".json?auth=" + FIREBASE_AUTH;

  gsmSerial.println("AT+HTTPTERM"); delay(1000);
  gsmSerial.println("AT+HTTPINIT"); delay(1000);
  gsmSerial.println("AT+HTTPPARA=\"CID\",1"); delay(600);
  gsmSerial.println("AT+HTTPPARA=\"URL\",\"" + url + "\""); delay(600);
  gsmSerial.println("AT+HTTPPARA=\"CONTENT\",\"application/json\""); delay(600);
  gsmSerial.println("AT+HTTPDATA=" + String(jsonBody.length()) + ",8000"); delay(300);

  // Wait for "DOWNLOAD" prompt before sending body (SIM7600 requires this)
  String dlResp = "";
  unsigned long dlT = millis();
  while (millis() - dlT < 4000) {
    esp_task_wdt_reset();
    while (gsmSerial.available()) dlResp += (char)gsmSerial.read();
    if (dlResp.indexOf("DOWNLOAD") != -1) break;
    if (dlResp.indexOf("ERROR") != -1) {
      Serial.println("AT+HTTPDATA ERROR: " + dlResp);
      gsmSerial.println("AT+HTTPTERM"); delay(500);
      return 0;
    }
  }
  Serial.println("DOWNLOAD prompt: " + dlResp);

  gsmSerial.print(jsonBody);
  delay(500);

  gsmSerial.println("AT+HTTPACTION=1");

  // Wait up to 20 seconds for +HTTPACTION URC (larger payloads can take longer)
  String response = "";
  unsigned long t = millis();
  while (millis() - t < 20000) {
    esp_task_wdt_reset();
    while (gsmSerial.available()) response += (char)gsmSerial.read();
    if (response.indexOf("+HTTPACTION:") != -1) break;
  }

  gsmSerial.println("AT+HTTPTERM"); delay(600);

  // Parse "+HTTPACTION: 1,<status>,<len>"
  int httpStatus = 0;
  int actionIdx = response.indexOf("+HTTPACTION:");
  if (actionIdx != -1) {
    int firstComma  = response.indexOf(',', actionIdx);
    int secondComma = response.indexOf(',', firstComma + 1);
    if (firstComma != -1 && secondComma != -1) {
      httpStatus = response.substring(firstComma + 1, secondComma).toInt();
    }
  }

  Serial.println("PUT " + path + " -> HTTP " + String(httpStatus));

  if (httpStatus == 401 || httpStatus == 403) {
    lcdPrint("Firebase Auth", "ERR " + String(httpStatus));
    Serial.println("ERROR: Firebase auth rejected (HTTP " + String(httpStatus) + "). Check FIREBASE_AUTH.");
    delay(2000);
  } else if (httpStatus == 0) {
    Serial.println("WARNING: No +HTTPACTION response received. Modem/network issue.");
    lcdPrint("No Response", "Check GSM");
    delay(1500);
  }

  return httpStatus;
}

void fetchMedications() {
  Serial.println("Fetching medications...");
  String body = firebaseGet("/medications");

  if (body == "" || body == "null") {
    Serial.println("No medications found.");
    slotCount = 0;
    return;
  }

  struct InFlight {
    String id;
    bool triggered;
    bool waitingConfirm;
    unsigned long alertStartTime;
  };

  InFlight saved[10];
  int savedCount = 0;
  for (int i = 0; i < slotCount && savedCount < 10; i++) {
    if (slots[i].triggered || slots[i].waitingConfirm) {
      saved[savedCount++] = {
        slots[i].id,
        slots[i].triggered,
        slots[i].waitingConfirm,
        slots[i].alertStartTime
      };
    }
  }

  StaticJsonDocument<4096> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.print("Medication JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

  slotCount = 0;
  int newCurrentDoseIndex = -1;

  for (JsonPair kv : doc.as<JsonObject>()) {
    if (slotCount >= 10) break;

    JsonObject med = kv.value().as<JsonObject>();
    if (!med["active"].as<bool>()) continue;

    slots[slotCount].id = kv.key().c_str();
    slots[slotCount].name = med["name"].as<String>();

    if (med.containsKey("hour")) {
      slots[slotCount].hour = med["hour"].as<int>();
      slots[slotCount].minute = med["minute"].as<int>();
    } else {
      String t = med["time"].as<String>();
      slots[slotCount].hour = t.substring(0, 2).toInt();
      slots[slotCount].minute = t.substring(3, 5).toInt();
    }

    if (DEMO_MODE && demoHour >= 0) {
      slots[slotCount].hour = demoHour;
      slots[slotCount].minute = demoMinute;
    }

    int comp = med["compartment"].as<int>();
    slots[slotCount].compartment = (comp > 0) ? comp - 1 : comp;
    if (slots[slotCount].compartment < 0) slots[slotCount].compartment = 0;
    if (slots[slotCount].compartment > 2) slots[slotCount].compartment = 2;

    slots[slotCount].pillCount = med["pillCount"] | 1;
    slots[slotCount].active = true;
    slots[slotCount].triggered = false;
    slots[slotCount].waitingConfirm = false;
    slots[slotCount].alertStartTime = 0;

    for (int j = 0; j < savedCount; j++) {
      if (saved[j].id == slots[slotCount].id) {
        slots[slotCount].triggered = saved[j].triggered;
        slots[slotCount].waitingConfirm = saved[j].waitingConfirm;
        slots[slotCount].alertStartTime = saved[j].alertStartTime;
        if (saved[j].waitingConfirm) newCurrentDoseIndex = slotCount;
        break;
      }
    }

    Serial.println("Loaded: " + slots[slotCount].name +
                   " " + pad(slots[slotCount].hour) + ":" + pad(slots[slotCount].minute) +
                   " C:" + String(slots[slotCount].compartment + 1) +
                   " Pills:" + String(slots[slotCount].pillCount));

    slotCount++;
  }

  currentDoseIndex = newCurrentDoseIndex;
  Serial.println(String(slotCount) + " medication slots loaded.");
}

void checkCommands() {
  String body = firebaseGet(String(DB_PATH) + "/commands");
  if (body == "" || body == "null") return;

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, body)) return;

  if (doc["dispenseNow"].as<bool>()) {
    int comp = doc["compartment"].as<int>();
    int count = doc["pillCount"] | 1;
    if (comp < 0) comp = 0;
    if (comp > 2) comp = 2;

    lcdPrint("Dispensing...", "Comp " + String(comp + 1));
    setRGB(0, 0, 1);
    buzzerAlert(2);
    dispensePills(comp, count);
    setRGB(0, 1, 0);

    logHistory("Manual", comp, "dispensed");
    sendDoseNotification("Manual Dispense", "dispensed");

    firebasePut(String(DB_PATH) + "/commands",
      "{\"dispenseNow\":false,\"compartment\":0,\"pillCount\":1,\"openDoor\":false,\"findDevice\":false}");
  }

  if (doc["findDevice"].as<bool>()) {
    lcdPrint("Find Device", "Ringing...");
    for (int i = 0; i < 6; i++) {
      setRGB(0, 0, 1);
      digitalWrite(BUZZER, HIGH);
      delay(250);
      setRGB(0, 0, 0);
      digitalWrite(BUZZER, LOW);
      delay(250);
    }
    setRGB(0, 1, 0);
  }
}

void updateDeviceStatus(bool connected) {
  DateTime now = rtc.now();
  String iso = String(now.year()) + "-" + pad(now.month()) + "-" + pad(now.day()) +
               "T" + pad(now.hour()) + ":" + pad(now.minute()) + ":" + pad(now.second()) + "Z";

  // Use millis()-based server epoch for lastSyncMs so the app's freshness check
  // isn't affected by RTC timezone/clock issues.  We store the RTC ISO for display
  // and a millis-delta timestamp that the app compares against Date.now().
  // Because we can't know the true epoch from millis alone, we use unixtime() but
  // also write a separate "uptimeMs" field the app can use as a liveness proof.
  String lastSyncMs = String((uint64_t)now.unixtime() * 1000ULL);
  String uptimeMs   = String(millis());
  int signal = modem.getSignalQuality();

  String json = "{\"connected\":" + String(connected ? "true" : "false") +
                ",\"battery\":100" +
                ",\"lastSync\":\"" + iso + "\"" +
                ",\"lastSyncMs\":" + lastSyncMs +
                ",\"uptimeMs\":" + uptimeMs +
                ",\"signalStrength\":" + String(signal) +
                ",\"model\":\"SmartDose SIM7600\"" +
                ",\"firmware\":\"1.0.0\"}";

  int httpStatus = firebasePut(String(DB_PATH) + "/device", json);
  if (httpStatus == 200) {
    Serial.println("Device status OK -> Firebase /device updated.");
  } else {
    Serial.println("Device status FAILED! HTTP=" + String(httpStatus));
    lcdPrint("Status FAIL", "HTTP:" + String(httpStatus));
    delay(2000);
  }
}

void logHistory(String medName, int comp, String status) {
  DateTime now = rtc.now();
  String ts = pad(now.hour()) + ":" + pad(now.minute());
  String key = String(now.unixtime());
  String json = "{\"time\":\"" + ts +
                "\",\"medication\":\"" + medName +
                "\",\"compartment\":" + String(comp) +
                ",\"status\":\"" + status + "\"}";
  firebasePut(String(DB_PATH) + "/history/" + key, json);
}

void handleSerialCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;
  Serial.println("> " + cmd);

  if (cmd == "stop") {
    pcf.write16(0x0000);
    Serial.println("All motors stopped.");
  } else if (cmd.startsWith("run ")) {
    int sp1 = cmd.indexOf(' ', 4);
    if (sp1 == -1) {
      Serial.println("Usage: run <0|1|2> <rotations> [cw|ccw]");
      return;
    }

    int motor = cmd.substring(4, sp1).toInt();
    int sp2 = cmd.indexOf(' ', sp1 + 1);
    int rots;
    bool cw;

    if (sp2 == -1) {
      rots = cmd.substring(sp1 + 1).toInt();
      cw = true;
    } else {
      rots = cmd.substring(sp1 + 1, sp2).toInt();
      String dir = cmd.substring(sp2 + 1);
      dir.toLowerCase();
      cw = (dir != "ccw");
    }

    if (motor < 0 || motor > 2 || rots < 1) {
      Serial.println("Invalid motor or rotations.");
      return;
    }
    runMotorTest(motor, rots, cw);
  } else if (cmd == "sync") {
    fetchMedications();
    updateDeviceStatus(true);
  } else if (cmd == "status") {
    updateDeviceStatus(true);
  } else if (cmd == "help") {
    Serial.println("Commands:");
    Serial.println("  run <0|1|2> <n> [cw|ccw]");
    Serial.println("  stop");
    Serial.println("  sync");
    Serial.println("  status");
  } else {
    Serial.println("Unknown command. Type help.");
  }
}