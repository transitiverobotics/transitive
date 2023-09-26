# Transitive Robotics Proxy

A reverse proxy that also terminates https.

## Setup

Requires `node` to be allowed to open ports below 1024:
```
sudo setcap 'cap_net_bind_service=+ep' `which node`
```
