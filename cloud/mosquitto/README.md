# File required for mosquitto


## Auth plugin

The [mosquitto-auth-plug](https://github.com/jpmens/mosquitto-auth-plug) is no longer supported by its creator and it didn't compile anymore. Had to make some minor changes to make it compile again. These changes are reflected in the tar-ball found here. After unpacking it should compile (at least for the HTTP backend we currently use), as long as there is a mosquitto source folder next to it (../mosquitto from the mosquitto-auth-plug folder).
