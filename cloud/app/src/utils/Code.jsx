import React, {useState} from 'react';
import { Highlight, themes } from 'prism-react-renderer'

const styles = {
  code: {
    borderLeft: '4px solid #46677c',
    padding: '0.5em 0.5em 0.5em 2.5em',
    textIndent: '-1.5em', // together with the above indents wrapped lines
    borderRadius: '4px',
    marginTop: '0.5em',
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  }
}

/** reusable component for showing code, highlighted using prism */
export const Code = ({code, language}) => {
  return <Highlight
    theme={themes.vsDark}
    code={code}
    language={language || 'jsx'}
  >
    {({ className, style, tokens, getLineProps, getTokenProps }) => (
      <pre style={{...styles.code, ...style}}>
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