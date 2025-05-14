import React, { useEffect, useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';

const SelfCheck = ({ mqttSync, agentPrefix }) => {
  const [selfCheckResults, setSelfCheckResults] = useState(null);

  useEffect(() => {
    const topic = `${agentPrefix}/status/selfChecks`;
    console.log('Subscribing to topic:', topic);

    const handleUpdate = (data) => {
      console.log('Received self-check data:', data);
      setSelfCheckResults(data);
    };

    handleUpdate(mqttSync.data.getByTopic(topic));
    mqttSync.data.subscribePath(topic, handleUpdate);

    // Cleanup subscription on unmount
    return () => {
      console.log('Unsubscribing from topic:', topic);
      mqttSync.data.unsubscribePath(topic, handleUpdate);
    };
  }, [mqttSync, agentPrefix]);

  if (!selfCheckResults || selfCheckResults?.running === true) {
    return <Spinner animation="border" size="sm" />;
  }

  if (selfCheckResults.errors) {
    return (
      <Alert variant="danger">
        <strong>Self-check failed:</strong>
        <ul>
          {selfCheckResults.errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      </Alert>
    );
  }

  return (
    <Alert variant="success">
      <strong>All self-checks passed successfully!</strong>
    </Alert>
  );
};

export default SelfCheck;
