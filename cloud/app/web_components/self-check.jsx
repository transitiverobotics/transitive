import React, { useEffect, useState } from 'react';
import { Alert } from 'react-bootstrap';

const selfCheckErrorMessages = {
  unshareNotSupported: 'unshare not supported, add kernel.apparmor_restrict_unprivileged_userns = 0 to /etc/sysctl.conf',
  bashNotInstalled: 'bash not installed, install bash',
  bashNotDefaultShell: 'bash not default shell, set bash as default shell',
};

const styles = {
  error: {
    marginBottom: '2em',
  }
};

const SelfCheck = ({ mqttSync, agentPrefix }) => {
  const [selfCheckErrors, setSelfCheckErrors] = useState(null);

  useEffect(() => {
    const topic = `${agentPrefix}/status/selfCheckErrors`;
    console.log('Subscribing to topic:', topic);

    const handleUpdate = (data) => {
      console.log('Received self-check data:', data);
      setSelfCheckErrors(data);
    };

    handleUpdate(mqttSync.data.getByTopic(topic));
    mqttSync.data.subscribePath(topic, handleUpdate);

    // Cleanup subscription on unmount
    return () => {
      console.log('Unsubscribing from topic:', topic);
      mqttSync.data.unsubscribePath(topic, handleUpdate);
    };
  }, [mqttSync, agentPrefix]);


  if (selfCheckErrors && selfCheckErrors.length > 0) {
    console.log('Self-check errors:', selfCheckErrors);
    return (
      <div style={styles.error}>
        <Alert variant="danger">
          <strong>Self-checks failed:</strong>
          <ul>
            {selfCheckErrors.map((error, name) => (
              <li key={name}>
                {selfCheckErrorMessages[error] || error}
              </li>
            ))}
          </ul>
        </Alert>
      </div>
    );
  } else {
    return (
      <></>
    );
  }

};

export default SelfCheck;
