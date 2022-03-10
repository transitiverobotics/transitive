import React from 'react';

const styles = {
  code: {
    fontFamily: 'monospace',
    color: '#700',
    borderLeft: '3px solid #aaa',
    padding: '0.5em 0.5em 0.5em 2em',
    backgroundColor: '#f0f0f0',
    borderRadius: '4px',
    marginTop: '0.5em',
    maxWidth: '80vw',
    overflowWrap: 'break-word'
  }
}

/** reusable component for showing code */
export const Code = ({children}) => <div style={styles.code}>
  {children}
</div>;
