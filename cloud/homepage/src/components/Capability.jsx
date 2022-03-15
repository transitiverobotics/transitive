import React, {useEffect, useState} from 'react';
import Layout from '@theme/Layout';
import ReactMarkdown from 'react-markdown'

const styles = {
  wrapper: {
    width: '90%',
    margin: 'auto',
    marginTop: '2em',
  },
  flex: {
    display: 'flex',
  },
  text: {
    flex: '1 0 60%'
  },
  images: {
    flex: '1 0 40%'
  },
  image: {
    width: '100%',
    paddingBottom: '0.6em',
    marginBottom: '0.6em',
    borderBottom: '1px solid #ccc'
  },
  date: {
  }
};

/** Used by plugin-dynamic-routes. We are in react-router v5 land here. */
const Capability = (props) => {
  const { scope, name } = props.match.params;
  const [capability, setCapability] = useState();
  useEffect(() => {
      const url = `//registry.${location.host}/${scope}%2F${name}`;
      fetch(url).then(res => res.json()).then(json => setCapability(json));
    }, []);

  if (!capability) {
    return <div>Fetching capability description..</div>;
  }

console.log({capability});
  return <div style={styles.wrapper}>
    <h2>{capability.versions[capability.version].transitiverobotics?.title || name}</h2>

    <div style={styles.flex}>
      <div style={styles.text}>
        <ReactMarkdown>
          {capability.readme}
        </ReactMarkdown>
        <hr/>
        Latest version: {capability.version}, <span
          style={styles.date}>published: {
            (new Date(capability.date)).toLocaleString()
          }</span>
      </div>

      <div style={styles.images}>
        {capability?.images.map((image, i) =>
          <img key={i} style={styles.image}
            src={`data:${image.mime};base64,${image.base64}`} />
        )}
      </div>
    </div>
  </div>
};

/** test with http://homedesk:8000/caps/@transitive-robotics%2Fhealth-monitoring */
export default (props) => <Layout>
  <Capability {...props} />
</Layout>;
