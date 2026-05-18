const cpGuides = [
  {
    category: "System & Health",
    links: [
      { title: "Check Point Processes and Daemons", sk: "sk97638" },
      { title: "CPinfo utility - How to run", sk: "sk92739" },
      { title: "High CPU / Memory Diagnosis", sk: "sk98348" },
      { title: "Gaia OS Best Practices & TS", sk: "sk109141" },
      { title: "Check Point Upgrade Map", sk: "sk138615" }
    ]
  },
  {
    category: "Traffic & Drops",
    links: [
      { title: "fw monitor - Capture Tool Guide", sk: "sk30583" },
      { title: "How to troubleshoot traffic drops", sk: "sk33755" },
      { title: "fw ctl zdebug drop - Explanation", sk: "sk43772" },
      { title: "Connection Table Explained", sk: "sk105154" }
    ]
  },
  {
    category: "Performance (CoreXL & SecureXL)",
    links: [
      { title: "SecureXL Overview & Best Practices", sk: "sk98722" },
      { title: "CoreXL Performance Tuning", sk: "sk98737" },
      { title: "Multi-Queue / Dynamic Dispatcher", sk: "sk105261" },
      { title: "Performance Tuning General Guide", sk: "sk167836" }
    ]
  },
  {
    category: "ClusterXL",
    links: [
      { title: "ClusterXL Troubleshooting Guide", sk: "sk100726" },
      { title: "How to initiate a manual failover", sk: "sk62013" },
      { title: "ClusterXL FAQ and Architecture", sk: "sk93306" },
      { title: "MAC Magic and CCP Troubleshooting", sk: "sk25977" }
    ]
  },
  {
    category: "VPN & Identity Awareness",
    links: [
      { title: "Site-to-Site VPN Troubleshooting", sk: "sk101211" },
      { title: "IKE and IPsec Debugging", sk: "sk104760" },
      { title: "Remote Access VPN Client Issues", sk: "sk113210" },
      { title: "Identity Awareness Troubleshooting", sk: "sk100612" }
    ]
  },
  {
    category: "Management & Policy",
    links: [
      { title: "Policy Installation Fails - Debug", sk: "sk110173" },
      { title: "SmartConsole / API Troubleshooting", sk: "sk114625" },
      { title: "Log Server / SmartEvent Issues", sk: "sk104387" },
      { title: "CPUSE - Gaia Software Updates", sk: "sk92449" }
    ]
  }
];

if (typeof module !== 'undefined') module.exports = cpGuides;
