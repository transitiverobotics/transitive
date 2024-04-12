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

  if (argc < 4) {
    printf("Usage: revertuid USERID GROUPID COMMAND [ARGS]\n");
    return 1;
  }

  int fd;

  unshare(CLONE_NEWUSER);

  fd = open("/proc/self/setgroups", O_WRONLY);
  write(fd, "deny", 4);
  close(fd);

  char uid[16];
  snprintf(uid, sizeof(uid), "%s 0 1", argv[1]);

  fd = open("/proc/self/uid_map", O_WRONLY);
  write(fd, uid, sizeof(uid));
  close(fd);

  char gid[16];
  snprintf(gid, sizeof(gid), "%s 0 1", argv[2]);

  fd = open("/proc/self/gid_map", O_WRONLY);
  write(fd, gid, sizeof(gid));
  close(fd);

  execvp(argv[3], argv + 3);
}
