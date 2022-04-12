
docker build . -t robot
mkdir -p /tmp/transitive-docker-robot
docker run -it --rm \
--env-file ../../cloud/.env \
--privileged \
--hostname robot_$(date -Iseconds | tr -d ':-' | cut -c -15) \
-v /tmp/transitive-docker-robot:/root/.transitive \
--name robot \
robot bash
