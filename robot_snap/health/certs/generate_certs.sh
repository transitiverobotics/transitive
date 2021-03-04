# generate client certificate for mqtt broker

if [ ! -e client.crt ]; then
  openssl genrsa -out client.key 2048
  openssl req -out client.csr -key client.key -new -subj="/CN=transitiverobotics-apps:health"
  openssl x509 -req -in client.csr -CA /etc/mosquitto/certs/ca.crt -CAkey /etc/mosquitto/certs/ca.key -CAcreateserial -out client.crt -days 36500
  echo "certificates generated"
else
  echo "certificates already exist, not overwriting"
fi
