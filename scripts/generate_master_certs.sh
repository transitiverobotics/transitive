# SSL: generate CA and server certificates if not present
# see https://mosquitto.org/man/mosquitto-tls-7.html
if [ ! -e certs ]; then
  echo "Generating new SSL CA and server certificates"
  mkdir -p certs
  cd certs

  echo "Generate a certificate authority certificate and key, without passphrase."
  openssl req -new -x509 -days 36500 -extensions v3_ca -keyout ca.key -out ca.crt -nodes -subj="/CN=Transitive Robotics"

  echo "Generate a server key without encryption."
  openssl genrsa -out server.key 2048
  echo "Generate a certificate signing request."
  openssl req -out server.csr -key server.key -new -subj="/CN=data.transitiverobotics.com"
  echo "Sign CSR with CA key."
  openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 36500

  chmod a+r *
  echo "CA and Server certificates ready."
else
  echo "mosquitto SSL certificates already exist, not regenerating"
fi
