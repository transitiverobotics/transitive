
# Cloud App

- Receives data from MQTT broker serving capabilities
- runs a websocket server that web components connect to for data
- authenticates these WS connections via the received JWT token
  - retrieves the id-specific secret from the user-database used by meteor (in mongodb)


## Some random notes from develop that might be useful

- MQTT manager
  - offer 'subscribe' function to caps (and later also publish)
- Caps Registry
  - serve as index from names to objects of type Capability
- Capability (class)
  - HM cap subclass
- http manager
  - serves static files (bundle(s))
  - authenticates ws clients
  - forwards them to appropriate capability
