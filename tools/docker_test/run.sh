
docker build . -t robot
docker run -it --env-file ../../cloud/.env --privileged --hostname robot1 robot bash
