import React, { useState, useEffect } from 'react';
import ReactWebComponent from 'react-web-component';

import { Form, Dropdown, DropdownButton, Button } from 'react-bootstrap';

import { useDataSync } from './hooks.js';
import { InlineCode, Timer } from './shared.jsx';

const styles = {
  selector: {
    label: {
      marginRight: '0.5em'
    }
  },
  image: {
    width: '100%',
    margin: '0.25em 0 0.25em 0',
  }
};

// a gray pixel to use when video-stream is inactive (will be scaled)
const PIXEL_4x3 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAQAAAAe/WZNAAAAEElEQVR42mOcXM8ABowYDAA1agM6T/cHjQAAAABJRU5ErkJggg==";


/** show list where user can select topic to display */
const TopicSelector = ({topics, topic, setTopic}) => <Form inline>
  <Form.Label htmlFor='topicSelector' style={styles.selector.label}>
    Video Stream
  </Form.Label>
  <DropdownButton id='topicSelector' title={topic} variant='outline-secondary'>
    { topics.map(t => <Dropdown.Item key={t} onClick={() => setTopic(t)}>
        {t}
      </Dropdown.Item>)}
  </DropdownButton>
</Form>;


const Device = (props) => {
  const [running, setRunning] = useState(false);
  const { status, ready, StatusComponent, data, dataCache }
    = useDataSync({ jwt: props.jwt, id: props.id });
  const [topic, setTopic] = useState();
  const [topics, setTopics] = useState([]);

  useEffect(() => {
      dataCache.subscribePath(`+org.+deviceId.video-streaming.imageTopics`,
        (value, key, matched) => {
          const parentKey = key.split('.').slice(0,-1).join('.');
          const list = dataCache.get(parentKey);
          console.log({parentKey, list});
          setTopics(list);
          !topic && list.length > 0 && setTopic(list[0]);
        });
    }, []);

  // note: props must include jwt and id
  window.tr_devmode && console.log('video-stream');

  const params = Object.assign({}, {topic, quality: 20}, props);
  const urlParams = Object.entries(params).map(x => x.join('=')).join('&');

  // console.log({data});

  if (!topic) {
    return <div>
      Waiting for streams to become available.
    </div>;
  }

  // console.log({topic, topics});

  return <div>
    {topics.length > 1 &&
        <TopicSelector topics={topics} topic={topic} setTopic={setTopic} />}
    {/* TODO: handle the case where the props already specify a topic to use */}
    <img src={running ?
        `http${TR_SECURE ? 's' : ''}://video.${TR_HOST}/stream?${urlParams}`
        : PIXEL_4x3 // we need this to surely stop the video stream
      } style={styles.image} />
    {<Timer duration={60}
      onTimeout={() => setRunning(false)}
      onStart={() => setRunning(true)} />}
  </div>
};

class App extends React.Component {
  render() {
    return <div>
      <style>
        @import url("https://maxcdn.bootstrapcdn.com/bootstrap/4.5.0/css/bootstrap.min.css");
      </style>
      <Device {...this.props}/>
    </div>;
  }
};

ReactWebComponent.create(<App />, 'video-streaming');
