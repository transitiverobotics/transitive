import React, { useState } from 'react';

import { Form, InputGroup, FormControl, Button, Modal, Tabs, Tab } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaCode } from 'react-icons/fa';
import _ from 'lodash';
import { getParameters } from "codesandbox/lib/api/define";

import {fetchJson, getLogger, decodeJWT} from '@transitive-sdk/utils-web';

import {Fold} from './Fold';
import {Code} from './Code';

const log = getLogger('Embed');
log.setLevel('debug');

const styles = {
  form: {maxWidth: '40em'},
  modalBody: {},
  icon: {
    transform: 'translateY(-1px)',
  },
};

/** format the given parameters for the html snippet to show */
const formatParams = (params) =>
  _.map(params, (value, key) => `${key}="${value}"`)
    .sort()
    .map(s => `\n  ${s}`)
    .join('');

/** reusable embedding instructions */
const EmbedBody = ({name, jwt, deviceId, extra={}, style, host, ssl,
    config = {}, bundle}) => {
    if (!jwt) {
      return <span></span>;
    }

    bundle ||= name;

    const [tokenName, setTokenName] = useState('');
    const [password, setPassword] = useState('');
    const [link, setLink] = useState();

    const jwtPayload = decodeJWT(jwt);
    const url = new URL(location.href);
    const id = jwtPayload.id;
    const urlParams = new URLSearchParams({userId: id, deviceId}).toString();
    const currentHost = `${url.protocol}//${url.host}`;
    const bundleURL = `${currentHost}/running/${jwtPayload.capability
      }/dist/${bundle}.js?${urlParams}`;
    const jwtPayloadExample = {...jwtPayload};
    delete jwtPayloadExample.userId;
    delete jwtPayloadExample.validity;
    delete jwtPayloadExample.iat;

    const defaultParams = `id="${id}" host="${host}" ssl="${ssl}"`;
    const paramString = formatParams({...extra, ...config});

    const createToken = () => {
      log.debug({tokenName, password});
      fetchJson('/@transitive-robotics/_robot-agent/createCapsToken',
        (err, res) => {
          if (err) {
            alert(err);
          } else {
            setLink(`${currentHost}/sac/${id}/${deviceId}/${jwtPayload.capability}/${name}?token=${tokenName}`);
          }
        },
        {body: {jwt, tokenName, password, config}});
    };

    const tryCode = `<script src="${bundleURL}"></script>\n<${name} ${defaultParams} jwt="${jwt}"${paramString} />`;
    const tryReact = `import { TransitiveCapability } from '@transitive-sdk/utils-web';\n...\n<TransitiveCapability jwt="${jwt}"${paramString} />`;

    const parameters = getParameters({ files: {
      'package.json': { content: { dependencies: {} }},
      'index.html': { content: tryCode },
      'sandbox.config.json': { content: {
        "infiniteLoopProtection": true,
        "hardReloadOnChange": false,
        "view": "browser",
        "template": "static"
      }}
    }});

    return <div style={{color: 'inherit'}}>
      <p>
        You can embed this UI component in other web pages or share it via a link.
      </p>
      <hr/>

      <h5>Testing</h5>
      <form action="https://codesandbox.io/api/v1/sandboxes/define" method="POST"
        target="_blank">
        <input type="hidden" name="parameters" value={parameters} />
        <Button variant="primary" size='sm' onClick={(e) => {
          e.preventDefault();
          e.target.parentNode.submit();
          return false;
        }}>
          Try it in a CodeSandbox
        </Button><br/>

        To test in your own web app, use one of these snippets. The included <a
          href="https://jwt.io/">JWT token</a> is valid for the next 12 hours
        from when this page was loaded.

        <Tabs
          id="uncontrolled-tab-example"
          className="mb-3"
        >
          <Tab eventKey="react" title="React">
            <Code code='npm i @transitive-sdk/utils-web' language='bash' />
            Then use:
            <Code code={tryReact} />
          </Tab>
          <Tab eventKey="html" title="HTML">
            <Code code={tryCode} />
          </Tab>
        </Tabs>

      </form>

      <hr/>

      <h5>Production</h5>
      In production replace the JWT with a new one signed with your JWT secret
      (see <Link to='/security'>Security</Link>), carrying the following payload:
      <Code code={['{',
            ..._.map(jwtPayloadExample, (value, key) => `  "${key}": "${value}",`),
            `  "userId": "user123", // a string that uniquely identifies a user in your context`,
            `  "validity": 86400, // number of seconds this authentication should remain valid`,
            `  "iat": 1234567890, // current time in seconds since 1970`,
            '}'
          ].join('\n')} />
      Note that some JWT libraries already include the `iat` field automatically.

      <hr/>

      <h5>Share</h5>

      <div>
        Alternatively, you can share this on a stand-alone,
        password-protected page. Set a name and password, then click "Get link".
        <Form action="#" onSubmit={(e) => {
          e.stopPropagation();
          e.preventDefault();
          createToken();
        }}>

          <InputGroup className="mb-3" size="sm" style={styles.form}>
            <FormControl
              placeholder="Name"
              aria-label="Name"
              value={tokenName}
              autoComplete="username"
              onChange={e => setTokenName(e.target.value)}
              />
            <FormControl
              type="password"
              placeholder="Set password"
              autoComplete="new-password"
              aria-label="Set password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              />
            <Button variant="secondary" id="b-addon2" onClick={createToken}>
              Get link
            </Button>
          </InputGroup>
          {link && <a href={link}>Link</a>}
        </Form>
      </div>
    </div>;
  };


export const Embed = ({style, compRef, capability, name, ...props}) => {
  const [show, setShow] = useState(false);
  const [config, setConfig] = useState(false);

  const open = () => {
    // get the config from the component for which we are showing embedding code
    const config = compRef.current.getConfig?.();
    config && setConfig(config);
    setShow(true);
  };

  return <div>
    <Button variant='link' onClick={open}>
      <FaCode style={styles.icon}/> Embed
    </Button>
    <Modal show={show} size="lg" centered aria-labelledby="embedding code"
      onHide={() => setShow(false)} >
      <Modal.Header closeButton>
        <Modal.Title>
          Embedding Instructions
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={styles.modalBody}>
        <EmbedBody name={name} {...props} config={config} />
      </Modal.Body>
    </Modal>
  </div>;
};