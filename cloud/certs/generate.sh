
# get the uid and gid of the owner of the current folder
OWNER=$(stat -c '%u:%g' .)

# SSL: generate CA and server certificates if not present
# see https://mosquitto.org/man/mosquitto-tls-7.html
if [ ! -e ca.crt ]; then
  echo "Generating a certificate authority certificate and key, without passphrase."
  openssl req -new -x509 -days 36500 -extensions v3_ca -keyout ca.key -out ca.crt -nodes -subj="/CN=Transitive Robotics"
  echo "CA certificate ready."

  # Create the serial number file for the CA in order to ensure the right ownership
  echo "01" > ca.srl

  # make sure the new files are owned by the same user and the containing folder
  chown $OWNER ca.*
else
  echo "CA certificate already exist, not regenerating"
fi

if [ ! -e server.crt ]; then
  echo "Generating a server key without encryption."
  openssl genrsa -out server.key 2048
  echo "Generating a certificate signing request."
  openssl req -out server.csr -key server.key -new -subj="/CN=data.transitiverobotics.com"
  echo "Sign CSR with CA key."
  openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 36500
  echo "Server certificate ready."
  # make sure the new files are owned by the same user and the containing folder
  chown $OWNER server.*
else
  echo "Server certificate already exist, not regenerating"
fi

if [ ! -e client.crt ]; then
  echo "Generating client certificate."
  openssl genrsa -out client.key 2048
  openssl req -out client.csr -key client.key -new -subj="/CN=transitiverobotics:cloud"
  openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out client.crt -days 36500
  echo "Client certificate ready."
  # make sure the new files are owned by the same user and the containing folder
  chown $OWNER client.*
else
  echo "Client certificate already exist, not regenerating"
fi
