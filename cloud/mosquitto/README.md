# Files required for mosquitto

## Auth plugin

We are now using two different auth plugins, the go-auth plugin, of which we use the HTTP mode for authenticating (web) client by JWT, and our own custom auth-transitive, see https://github.com/chfritz/transitive/issues/250. The latter is *much* faster than using go-auth's JS mode.

## Notes

In the past we used [mosquitto-auth-plug](https://github.com/jpmens/mosquitto-auth-plug), which contains some good hints for using mosquitto's C API.