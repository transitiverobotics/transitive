import React from 'react';

const styles = {
  code: {
    fontFamily: 'monospace',
    fontSize: 'small',
    color: '#700',
    borderLeft: '4px solid #622',
    padding: '0.5em 0.5em 0.5em 2em',
    backgroundColor: '#d0d0d070',
    borderRadius: '4px',
    marginTop: '0.5em',
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap'
  }
}

/** reusable component for showing code */
export const Code = ({children}) => <pre style={styles.code}>
  {children}
</pre>;
// {React.Children.map(children, text => text.replace(/\n/g, '<br/>'))}
