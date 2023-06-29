import React, {useState} from 'react';
import { FaRegCopy } from 'react-icons/fa';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Prism, Highlight, themes } from 'prism-react-renderer'
// load bash syntax highlighting
import bashLang from 'refractor/lang/bash';
bashLang(Prism);

const styles = {
  code: {
    borderLeft: '4px solid #46677c',
    padding: '0.5em 0.5em 0.5em 2.5em',
    textIndent: '-1.5em', // together with the above indents wrapped lines
    borderRadius: '4px',
    marginTop: '0.5em',
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
    paddingRight: '2em',
  },
  copy: {
    position: 'absolute',
    right: '2.5em',
  },
  checkmark: {
    color: '#1ec21e',
  }
};

const theme = themes.vsDark;
// monkey-patch the theme we use
theme.plain.color = '#aaa';

const CopyButton = ({code}) => {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const copy = () => navigator.clipboard.writeText(code);

  return <div style={styles.copy}>
    <OverlayTrigger overlay={<Tooltip id='copy'>copied</Tooltip>}
      placement='top-end'
      show={showTooltip}
    >
      <a href='#' onClick={(e) => {
        e.preventDefault();
        copy();
        setCopied(true);
        setShowTooltip(true);
        setTimeout(() => setShowTooltip(false), 1000);
        return false;
      }}>
        {copied ? <span style={styles.checkmark}>✓</span>: <FaRegCopy/>}
      </a>
    </OverlayTrigger>
  </div>;
}

/** reusable component for showing code, highlighted using prism */
export const Code = ({code, language}) => {

  return <Highlight
    theme={theme}
    code={code}
    language={language || 'jsx'}
  >
    {({ className, style, tokens, getLineProps, getTokenProps }) => (
      <pre style={{...styles.code, ...style}}>
        <CopyButton code={code} />

        {tokens.map((line, i) => (
          <div key={i} {...getLineProps({ line })}>
            {line.map((token, key) => (
              <span key={key} {...getTokenProps({ token })} />
            ))}
          </div>
        ))}
      </pre>
    )}
  </Highlight>;
}