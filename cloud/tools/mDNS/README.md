
A small mDNS service that points all subdomains on `$HOSTNAME.local` to the host's IP.

For this to work you'll need to make sure your system is configured to resolve mDNS hostnames. On Ubuntu this is usually the case when:
- `avahi-daemon` is running,
- the `libnss-mdns` package is installed,
- `mdns4` is enabled in your `/etc/nsswitch.conf` instead `mdns4_minimal`, e.g.:
   ```
   hosts:          files mdns4 [NOTFOUND=return] dns
   ```
   and
- all `.local` domains are allowed in mDNS. See https://github.com/lathiat/nss-mdns#etcmdnsallow.
  - for this it is usually sufficient to create `/etc/mdns.allow` and/or add:
  ```
  .local.
  .local
  ```
  to it. This will take effect immediately, no service restarts are required.

When everything is working you should be able to `ping any-domain-you-make-up.$HOSTNAME.local`. If that is not the case, then something isn't working.