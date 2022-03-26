FROM ensure_certs as certs

FROM iegomez/mosquitto-go-auth:latest-mosquitto_2.0.14

COPY mosquitto.conf /mosquitto/mosquitto.conf
COPY auth /mosquitto/auth/
RUN cp /mosquitto/go-auth.so /mosquitto/go-auth2.so

# for compatibility with dev setup
RUN ln -s /mosquitto /etc/mosquitto

COPY --from=certs /certs /etc/mosquitto/certs

# make sure to mount certs on /mosquitto/config/certs
EXPOSE 8883/tcp
EXPOSE 9001/tcp
