export
pwd
ls
ls /opt/ros
# . /opt/ros/melodic/setup.bash
# rostopic echo /turtle1/pose
find /root
find $HOME
hostname
ls -la `which df`
ls -l /bin
groups

# permission denied
df

# works, but we are jailed, so only seeing our fake mount space, not the
# partitions we care about
echo "import os; print(os.statvfs('/'))" | python3
