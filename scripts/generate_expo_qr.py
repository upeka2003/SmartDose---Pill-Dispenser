import qrcode

# Expo Go URL
url = "exp://10.16.141.22:8081"

# Generate QR code
img = qrcode.make(url)
img.save("expo_qr.png")
print("QR code saved as expo_qr.png")
