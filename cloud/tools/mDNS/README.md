
A small mDNS service that points all subdomains on `$HOSTNAME.local` to the host's IP.

For this to work you'll need to make sure your system is configured to resolve mDNS hostnames. On Ubuntu this is usually the case when the libnss-mdns package is installed, `mdns4` is enabled in your `/etc/nsswitch.conf`, and all `.local` domains are allowed in mDNS. See https://github.com/lathiat/nss-mdns#etcmdnsallow.

