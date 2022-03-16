import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import docuStyles from './index.module.css';
// import HomepageFeatures from '@site/src/components/HomepageFeatures';

import { FaRegPlayCircle } from 'react-icons/fa';


const F = React.Fragment;

const styles = {
  wrapper: {
    paddingBottom: '4em',
    maxWidth: '70em',
    margin: 'auto',
  },
  text: {
    position: 'relative',
    zIndex: 2,
    top: 'calc(50% - 10vw)',
    width: '40vw',
    margin: 'auto',
    textAlign: 'left',
    fontSize: '1.8em',
    // fontWeight: 'bolder',
    // lineHeight: '3em',
    userSelect: 'none',
    color: '#000',
  },
  logo: {
    verticalAlign: 'top',
    display: 'inline-block',
    height: '2em',
    marginBottom: '0.5em'
  },
  image: {
    width: '100%',
    maxHeight: '40em'
  },
  row: {
    margin: '8em auto 4em auto',
    maxWidth: '65em',
    display: 'flex',
    justifyContent: 'space-around',
    flexWrap: 'wrap'
  },
  col: {
    flex: '1 1 30em',
    padding: '0em 1.5em 0em 1.5em',
    margin: '1em 0em 1em 0em',
    alignSelf: 'center',
    columnGap: '3em'
  },
  bar: {
    backgroundColor: 'none',
  },
  button: {
    marginTop: '1em'
  },
  credits: {
    fontSize: 'smaller',
    textAlign: 'center',
    paddingTop: '1em'
  }
};


const elements = [
  { title: <h1><b>Full-stack robotic capabilities</b></h1>,
    text: <F>
      <p>
        Build and scale your robotics applications faster and cheaper with
        end-to-end software <Link to='/caps'>capabilities</Link> that easily
        integrate with your existing web applications. <Link to="/demo">
          <FaRegPlayCircle /> Demo</Link>
      </p>
      <p>
        <a className="button button--success"
          href='https://docs.google.com/forms/d/e/1FAIpQLSctAX9NI6IlZ10e7n408NSxULLKbbSyx8rrQSsLVECtlpHbeg/viewform?usp=sf_link'
          style={styles.button}>
          Request an invite to our private beta
        </a>
      </p>
      <p>
      Or get in touch: <a
          href="mailto:support@transitiverobotics.com">
          support@transitiverobotics.com
        </a>
      </p>
    </F>,
    image: '/img/fullstack.svg'
  },

  { title: 'Robotics is hard, software is key',
    text: <F>
      While designing, building, and deploying your own hardware seems
      hard enough, all the software you need has to be custom developed
      as well. ROS and ROS2 are great for the software on the robot itself,
      but to implement robotic applications that generate value to your customers
      and for you to deploy and operate a growing fleet you need a lot more.
      Many of the software capabilities you need span multiple systems including
      robots, the cloud, user-interfaces, and on-prem servers, and their type
      ranges from devops and fleet management, over administrative tools, to
      infrastructure integrations, computer vision and ML, to social navigation
      behaviors. This software does not exist as commercial-of-the-shelf or
      open-source components and for good reason: there isn't even a commonly
      accepted platform for developing and sharing it.
    </F>,
    image: '/img/capabilities.svg'
  },

  { title: 'A parallel stack offering end-to-end capabilities',
    text: <F>
      Transitive Robotics offers independent software capabilities that you can
      use to build your solution faster and cheaper. Like an exo-skeleton, the
      Transitive Robotics platform runs in parallel to your existing application
      stack connecting at just two points: your robots and your web applications.
      This means that integration is trivial: you install a sandboxed agent on
      your robots, and then, for each capability you want, you copy & paste the
      provided HTML snippet into your web app where you want the front-end
      components of the capability to appear. Once the agent is installed you can
      easily add capabilities to your robots by choosing from the ones in our Cap
      Store. Each capability is end-to-end, meaning that it provides all the
      functions needed to be useful. For instance, our video-streaming capability
      provides all the back-end logic on the robot for tapping video sources,
      encrypts the stream, sends it through the cloud and past firewalls, and
      decrypts and renders the video in your users' browsers as part of your own
      web application.
    </F>,
    image: '/img/arch.svg'
  },

  // single text or single images will be full-width
  // {
  //   image
  // },

  { title: 'Focus on your differentiation',
    text: <F>
      Health monitoring, low-latency video streaming, alerting, reliable remote
      access, and many other capabilities are all necessary table-stakes to run
      your fleet. But none of them will make you sell more robots or generate
      more value to your customers. To outrun the competition and to make the
      most use of your available resources you need to focus on what sets you
      apart in the marketplace. For all other needs there is Transitive. Whether
      you look for faster growth, lower cost, or higher quality, by chosing to
      outsource capabilities to people who specialize on them you get the best
      solution for your money.
    </F>
  },

  { title: 'Transitive Robotics is different',
    text: <F>
      <p>
        Some full-fledged fleet management solutions for robotics already exist.
        These solutions offer a lot of useful features and can get you off the
        ground quickly. However, these platforms make you choose: you either use
        their platform or you build your own. This is a tough decision to make
        between two less-than-perfect solutions. On the one hand these platforms
        provide you with most of the features you need right away. On the other
        hand, when they fall short of your needs you cannot extend them, so you
        are stuck. There is no middle-ground, because these solutions are
        separate, monolithic platforms with their own front-ends. Some of them
        have APIs, but what you can do via these APIs is limited. Most
        importantly, none of the existing solutions offer componentized
        capabilities that you can integrate into your own solutions. You also have
        to pay for the entire suite of tools provided, even if all you
        need is one or two of their features, like remote tele-operation or video
        streaming. This means that your starting cost is typically around
        $100/robot/month.
      </p>

      <p> In contrast, Transitive is open-core and offers individual
      capabilities that are priced separately—some as low as $5/robot/month
      others are even free!—that can be embedded in your own web front-ends.
      This means that you are still in full control of the solutions you are
      building, whether it is customer facing or for your own operations teams
      and partners. And you only pay for what you need. </p>
    </F>
  },
];



// const Navigation = () =>
//   <Navbar expand="sm" style={styles.bar}>
//     <Navbar.Brand as={Link} to="/">
//       <img src='/logo_text.svg' title='Transitive Robotics' style={styles.logo} />
//     </Navbar.Brand>
//     <Navbar.Toggle aria-controls="basic-navbar-nav" />
//     <Navbar.Collapse id="basic-navbar-nav">
//       <Nav className="mr-auto">
//         <Nav.Link as={Link} to="/documentation">Documentation</Nav.Link>
//         <Nav.Link as={Link} to="/demo">Demo</Nav.Link>
//         <Nav.Link as={Link} to="/caps">Capabilities</Nav.Link>
//       </Nav>
//
//       <Nav>
//         <Nav.Link as={Link} to="/login">Login</Nav.Link>
//       </Nav>
//     </Navbar.Collapse>
//   </Navbar>;


// const TitleWithLogo = () => <div style={styles.text}>
//   <img src='/logo_text.svg' title='Transitive Robotics' style={styles.logo} />
//   <div>Full-stack robotic capabilities as a service</div>
// </div>;

const TRHome = () => {

  return <div style={styles.wrapper}>

    <div className="alert alert--info" role="alert"
      style={{margin: '2em', marginTop: '2em', textAlign: 'center'}}>
      We are going open-source! Sign up below to be notified when we make the
      release.
    </div>

    {elements.map( ({title, text, image}, i) => {
      const sectionCount = !!image + !!text;

      // CSS makes it two-column when no image and not a small screen
      const textSection = <div style={styles.col}
        className={sectionCount == 1 ? 'two-column-when-space' : ''}>
        {typeof title == 'string' ? <h2>{title}</h2> : title}
        {text}
      </div>;

      const imageSection = <div style={styles.col}>
        <img src={image} style={styles.image} />
      </div>;

      return (i % 2 ?
        <div key={i} style={styles.row}>
          {image && imageSection} {text && textSection}
        </div> :
        <div key={i} style={styles.row}>
          {text && textSection} {image && imageSection}
        </div>
      );
    })}
  </div>
};







// function HomepageHeader() {
//   const {siteConfig} = useDocusaurusContext();
//   return (
//     <header className={clsx('hero hero--primary', docuStyles.heroBanner)}>
//       <div className="container">
//         <h1 className="hero__title">{siteConfig.title}</h1>
//         <p className="hero__subtitle">{siteConfig.tagline}</p>
//         <div className={docuStyles.buttons}>
//           <Link
//             className="button button--secondary button--lg"
//             to="/docs/intro">
//             Docusaurus Tutorial - 5min ⏱️
//           </Link>
//         </div>
//       </div>
//     </header>
//   );
// }

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Full-stack robotic capabilities">
      <main>
        <TRHome />
      </main>

      <div style={styles.credits}>
        Icon credits:
        delivery robot by iconcheese,
        industrial robot by Dooder,
        dashboard by LAFS, and
        drone by Soremba from <a
          href="https://thenounproject.com/">The Noun Project</a>.
      </div>
    </Layout>
  );
  // <HomepageFeatures />
}
