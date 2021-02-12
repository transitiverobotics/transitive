echo postinstall!

# env > /tmp/ENV
# date > /tmp/postinstalled

# install systemd user service
mkdir -p $HOME/.config/systemd/user/
cp transitive-robot.service $HOME/.config/systemd/user/

# allow service to run on boot without user logging in
loginctl enable-linger $USER
systemctl --user daemon-reload
systemctl --user enable transitive-robot.service
systemctl --user start transitive-robot.service

echo postinstall done!
