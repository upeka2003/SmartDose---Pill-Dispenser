#define TINY_GSM_MODEM_SIM800 // Or your specific modem (e.g. SIM900, SIM7600)
#include <TinyGsmClient.h>
#include <FirebaseESP32.h>

// GSM module pins
#define RX_PIN 16
#define TX_PIN 17
HardwareSerial SerialAT(2); // Use Serial2 for ESP32

TinyGsm modem(SerialAT);
// Secure client is often needed for Firebase
TinyGsmClientSecure client(modem);

// GPRS credentials (leave empty if not needed)
const char apn[]      = "Dialog"; // Example APN for Sri Lanka
const char gprsUser[] = "";
const char gprsPass[] = "";
#define FIREBASE_HOST  "smartdose-dcd88-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH  "CZnwewbitQSo2RY8CvP6nf0lHbX4fAgwS7dZAKMi"

#define MOTOR_IN1   18
#define MOTOR_IN2   19
#define LED_PIN     2
#define BUZZER_PIN  5
#define IR_SENSOR   34
#define BUTTON_PIN  4

FirebaseData fbdo;
FirebaseConfig config;
FirebaseAuth auth;

unsigned long lastStatusUpdate = 0;
unsigned long lastFirebaseCheck = 0;

void setup() {
  Serial.begin(115200);

  pinMode(MOTOR_IN1, OUTPUT);
  pinMode(MOTOR_IN2, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(IR_SENSOR, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, LOW);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  SerialAT.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);
  delay(3000);

  Serial.println("Initializing modem...");
  modem.init();

  Serial.print("Connecting to APN: ");
  Serial.println(apn);
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println("GPRS connection failed");
  } else {
    Serial.println("\nGPRS Connected!");
  }

  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;

  Firebase.begin(&config, &auth);
  // Disabled Wi-Fi reconnect. Depending on Firebase lib version, 
  // you might need to register the GSM client with Firebase.
  // Firebase.reconnectWiFi(true);

  Firebase.setBool(fbdo, "/device/connected", true);
  Firebase.setInt(fbdo, "/device/battery", 85);
  Firebase.setString(fbdo, "/device/lastSync", "just now");
  Firebase.setBool(fbdo, "/device/dispenseNow", false);

  Serial.println("SmartDose Ready!");
  blinkLED(3);
}

void loop() {
  if (millis() - lastFirebaseCheck > 1000) {
    lastFirebaseCheck = millis();

    if (Firebase.getBool(fbdo, "/device/dispenseNow")) {
      if (fbdo.boolData()) {
        Serial.println("Dispensing!");
        dispensePill();
        Firebase.setBool(fbdo, "/device/dispenseNow", false);
        Firebase.setBool(fbdo, "/device/pillDispensed", true);
      }
    }
  }

  if (digitalRead(BUTTON_PIN) == LOW) {
    dispensePill();
    Firebase.setBool(fbdo, "/device/pillDispensed", true);
    delay(1000);
  }

  if (millis() - lastStatusUpdate > 30000) {
    lastStatusUpdate = millis();
    Firebase.setBool(fbdo, "/device/connected", true);
    Firebase.setString(fbdo, "/device/lastSync", "just now");
  }
}

void dispensePill() {
  digitalWrite(LED_PIN, HIGH);
  beep(1);
  digitalWrite(MOTOR_IN1, HIGH);
  digitalWrite(MOTOR_IN2, LOW);
  delay(1500);
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, LOW);
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, HIGH);
  delay(1500);
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, LOW);
  digitalWrite(LED_PIN, LOW);
  beep(2);
  Serial.println("Done!");
}

void blinkLED(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(200);
    digitalWrite(LED_PIN, LOW);
    delay(200);
  }
}

void beep(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(150);
    digitalWrite(BUZZER_PIN, LOW);
    delay(150);
  }
}