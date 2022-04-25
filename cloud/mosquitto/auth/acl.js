

function checkAcl(username, topic, acc) {
  // everyone is allowed to subscribe to the broker's heartbeat
  if (topic == '$SYS/broker/uptime') return true;

  var usernameParts = username.split(':');
  var topicParts = topic.split('/'); // note: no slashes allowed in meta fields
  var rtv = (usernameParts[0] == 'cap' ?
    // it's a cloud capability: give access to namespace
    usernameParts[1] == topicParts[3] + '/' + topicParts[4]
        // // allow all cloud capabilities to read _robot-agent
        // || (topicParts[3] == '_robot-agent' &&
        //     (acc == 1 || acc == 4) // allow read and subscribe
        // )
        // NOT IN USE; fortunately not necessary anymore
    :
    // it's a robot, match owner and deviceId
    usernameParts[0] == topicParts[1] && usernameParts[1] == topicParts[2]
  );
  console.log('acl', username, topic, acc, rtv);
  return rtv;
}

/** example of what this script gets from the mosquitto go-auth plugin
> console.log('acl', JSON.stringify(this, true, 2));
acl {
 "acc": 2,
 "clientid": "mqttjs_8dc4e777",
 "console": {},
 "topic": "/qEmYn5tibovKgGvSm/19b19adb282aab3d6e582a14e28a9ef6/_robot-agent/status",
 "username": "qEmYn5tibovKgGvSm:19b19adb282aab3d6e582a14e28a9ef6"
}
*/
checkAcl(username, topic, acc);
