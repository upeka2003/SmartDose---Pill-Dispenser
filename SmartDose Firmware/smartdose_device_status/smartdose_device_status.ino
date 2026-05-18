#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <time.h>

// Fill these from your WiFi and Firebase project.
#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define API_KEY "YOUR_FIREBASE_WEB_API_KEY"
#define DATABASE_URL "https://smartdose-dcd88-default-rtdb.firebaseio.com"

// Use an Email/Password account that exists in Firebase Authentication.
#define USER_EMAIL "YOUR_FIREBASE_EMAIL"
#define USER_PASSWORD "YOUR_FIREBASE_PASSWORD"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

const unsigned long HEARTBEAT_MS = 10000;
unsigned long lastHeartbeat = 0;

String isoNow() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "";
  }

  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}

void sendDeviceStatus() {
  FirebaseJson json;
  json.set("connected", true);
  json.set("battery", 90);
  json.set("lastSync", isoNow());
  json.set("lastSyncMs", (int64_t)time(nullptr) * 1000);
  json.set("signalStrength", WiFi.RSSI());
  json.set("model", "SmartDose ESP32");
  json.set("firmware", "1.0.0");

  if (!Firebase.RTDB.updateNode(&fbdo, "/smartdose/device", &json)) {
    Serial.print("Status update failed: ");
    Serial.println(fbdo.errorReason());
  } else {
    Serial.println("SmartDose status updated");
  }
}

void setup() {
  Serial.begin(115200);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("WiFi connected");

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  sendDeviceStatus();
}

void loop() {
  if (Firebase.ready() && millis() - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = millis();
    sendDeviceStatus();
  }
}
