import React, {useEffect, useState} from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import BrowserOnly from '@docusaurus/BrowserOnly';

// import docuStyles from './index.module.css';
// import HomepageFeatures from '@site/src/components/HomepageFeatures';

// import { FaRegPlayCircle } from 'react-icons/fa';

// const F = React.Fragment;

const styles= {
  capability: {width: '20em'},
  main: {
    margin: '1em',
    maxWidth: '100em'
  }
};

const Capabilities = () => {
  const [capabilities, setCapabilities] = useState();
  useEffect(() => {
      const url = `//registry.${location.host}/-/custom/all`;
      fetch(url).then(res => res.json()).then(json =>
        setCapabilities(json.filter(cap =>
          // Only packages with a 'transitiverobotics' field are capabilities.
          // The rest are utils, _robot-agent, or similar.
          cap.versions[0].transitiverobotics)));
    }, []);


  if (!capabilities) {
    return <div>Fetching capability list..</div>;
  }

  console.log({capabilities});
  const Debug = () => <pre>{JSON.stringify(capabilities, true, 2)}</pre>;
  const List = () => <div>{capabilities.map(cap =>
      <div key={cap._id} style={styles.capability} className="card">
        <div className="card__header">
          <h6>{cap.versions[0].transitiverobotics.title}</h6>
        </div>
        <div className="card__body">
          {cap.description}
        </div>
        <div className="card__footer">
          <Link className="button button--secondary button--block"
            href={`/caps/${cap.name}`}
          >View</Link>
        </div>
      </div>
    )}</div>;

  return <List/>;
};

export default () => {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Capabilities | ${siteConfig.title}`}
      description="Capabilities Store">
      <main style={styles.main}>
        <BrowserOnly fallback={<div>Loading...</div>}>
          {() => <Capabilities />}
        </BrowserOnly>
      </main>
    </Layout>
  );
}
