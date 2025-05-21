import React, { useEffect, useState } from 'react';
import { Alert } from 'react-bootstrap';

const styles = {
  error: {
    marginBottom: '2em',
  }
};

const SelfCheck = ({ mqttSync, agentPrefix }) => {
  const [failedChecks, setFailedChecks] = useState(null);

  useEffect(() => {
    const topic = `${agentPrefix}/status/selfCheckErrors`;
    console.log('Subscribing to topic:', topic);

    const handleUpdate = (data) => {
      console.log('Received self-check data:', data);
      setFailedChecks(data);
    };

    handleUpdate(mqttSync.data.getByTopic(topic));
    mqttSync.data.subscribePath(topic, handleUpdate);

    // Cleanup subscription on unmount
    return () => {
      console.log('Unsubscribing from topic:', topic);
      mqttSync.data.unsubscribePath(topic, handleUpdate);
    };
  }, [mqttSync, agentPrefix]);


  if (failedChecks && failedChecks.length > 0) {
    console.log('Self-check errors:', failedChecks);
    return (
      <div style={styles.error}>
        <Alert variant="danger">
          <strong>Self-checks failed:</strong>
          <ul>
            {failedChecks.map((error, index) => (
              <li key={index}>{error}</li>
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
