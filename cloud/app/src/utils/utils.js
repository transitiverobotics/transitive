import { useEffect, useState } from 'react';

/** ensure the named web component is loaded; if not, it is loaded assuming
  the .js file it is defined in has the same name as the component itself */
export const ensureWebComponentIsLoaded = (capability, name, userId, deviceId) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
      if (userId && deviceId && !customElements.get(name)) {
        const url = new URL(location.href);
        const script = document.createElement('script');
        const params = `userId=${userId}&deviceId=${deviceId}`;
        script.setAttribute('src', `/running/${capability}/dist/${name}.js?${params}`);
        // `${url.protocol}//data.${url.host}/bundle/${capability}/dist/${name}.js?${params}`);
        script.onload = () => {
          console.log(`loaded ${name}`);
          setReady(true);
        };
        document.head.appendChild(script);
      } else {
        setReady(true);
      }
    }, [capability, name, userId, deviceId]);

  return {ready};
};
