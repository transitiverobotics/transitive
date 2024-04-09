// from
// https://unix.stackexchange.com/questions/440177/unshare-map-root-user-switch-to-original-uid-username-after-setup
// usage:
// revertuid USERID COMMAND
// e.g.,
// revertuid 1001 bash

#define _GNU_SOURCE
#include <sched.h>

#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <stdio.h>

#include <unistd.h>

int main(int argc, char *argv[]) {
  int fd;

  unshare(CLONE_NEWUSER);

  fd = open("/proc/self/setgroups", O_WRONLY);
  write(fd, "deny", 4);
  close(fd);

  char buf[12];
  snprintf(buf, sizeof(buf), "%s 0 1", argv[1]);

  fd = open("/proc/self/uid_map", O_WRONLY);
  write(fd, buf, sizeof(buf));
  close(fd);

  fd = open("/proc/self/gid_map", O_WRONLY);
  write(fd, buf, sizeof(buf));
  close(fd);

  execvp(argv[2], argv + 2);
}
