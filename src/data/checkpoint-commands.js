// ShellPoint — Check Point Command Database
// Commands with type:"flags" use the advanced flag-builder modal

const cpCommands = [

  // ==============================
  // CLUSTER & HIGH AVAILABILITY
  // ==============================
  {
    category: "Cluster & HA",
    commands: [
      { id:"cphaprob_stat",    cmd:"cphaprob stat",          desc:"Show cluster members status" },
      { id:"cphaprob_if",      cmd:"cphaprob -a if",         desc:"Show cluster interfaces status" },
      { id:"cphaprob_syncstat",cmd:"cphaprob syncstat",       desc:"Show sync (delta sync) statistics" },
      { id:"cphaprob_list",    cmd:"cphaprob list",           desc:"Show critical devices list" },
      { id:"cphaprob_ia",      cmd:"cphaprob -ia list",       desc:"Show all monitored devices" },
      { id:"clusterxl_admin_down", cmd:"clusterXL_admin down",      desc:"Set cluster member administratively down" },
      { id:"clusterxl_admin_up",   cmd:"clusterXL_admin up",        desc:"Set cluster member administratively up" },
      { id:"fw_hastat",        cmd:"fw hastat",               desc:"Firewall HA state summary" },
      { id:"clish_cluster_if", cmd:"clish -c 'show cluster members interfaces all'", desc:"Cluster member interfaces (clish)" },
      { id:"cpstart",          cmd:"cpstart",                 desc:"Start Check Point services" },
      { id:"cpstop",           cmd:"cpstop",                  desc:"Stop Check Point services" },
      { id:"cprestart",        cmd:"cprestart",               desc:"Restart Check Point services" },
      { id:"clish_cluster_st", cmd:"clish -c 'show cluster state'", desc:"Show cluster state (clish)" },
      {
        id:"cphaconf_prio",
        cmd:"cphaconf set_prio {priority}",
        desc:"Set cluster member priority",
        params:[{ name:"priority", label:"Priority (e.g. 1)", default:"1" }]
      }
    ]
  },

  // ==============================
  // FIREWALL POLICY
  // ==============================
  {
    category: "Firewall Policy",
    commands: [
      { id:"fw_stat",       cmd:"fw stat",                  desc:"Show installed policy name and date" },
      { id:"fw_ctl_pstat",  cmd:"fw ctl pstat",             desc:"Show firewall kernel statistics" },
      { id:"fw_fetch",      cmd:"fw fetch localhost",        desc:"Fetch policy from local management" },
      {
        id:"fw_fetch_mgmt",
        cmd:"fw fetch {mgmt_ip}",
        desc:"Fetch policy from remote management",
        params:[{ name:"mgmt_ip", label:"Management IP", default:"192.168.1.100" }]
      },
      { id:"fw_unloadlocal", cmd:"fw unloadlocal",          desc:"Unload local policy (allow all)" },
      { id:"fw_tab_conns",  cmd:"fw tab -t connections -s", desc:"Connections table stats" },
      { id:"fw_tab_conns_f",cmd:"fw tab -t connections -f", desc:"Connections table (flush)" },
      { id:"fw_ctl_max",    cmd:"fw ctl get int fwx_max_conns", desc:"Show max connections limit" },
      { id:"fw_ctl_multik", cmd:"fw ctl multik stat",       desc:"CoreXL workers statistics" },
      { id:"fwaccel_stat",  cmd:"fwaccel stat",             desc:"SecureXL on/off status" },
      { id:"fwaccel_stats", cmd:"fwaccel stats -s",         desc:"SecureXL acceleration stats" },
      { id:"fwaccel_conns", cmd:"fwaccel conns",            desc:"SecureXL connections table" },
      { id:"fwaccel_tpl",   cmd:"fwaccel templates",        desc:"SecureXL templates" },
      { id:"fw_affinity",   cmd:"fw ctl affinity -l -a",    desc:"CoreXL CPU affinity" }
    ]
  },

  // ==============================
  // TCPDUMP BUILDER (flag-based)
  // ==============================
  {
    category: "Tcpdump Builder",
    commands: [
      {
        id: "tcpdump_builder",
        type: "flags",
        label: "tcpdump",
        desc: "Build a tcpdump command with filters",
        buildMode: "tcpdump",
        flags: [
          // --- OPTIONS (go before the expression) ---
          {
            id: "iface",     category: "option",
            code: "-ni",     template: "-ni {v}",
            label: "Interface",
            desc: "Network interface to sniff on. 'any' captures all interfaces. Use eth0, bond1, etc. for specific ones.",
            enabled: true,   hasValue: true,
            placeholder: "any",  value: "any",  required: true
          },
          {
            id: "count",     category: "option",
            code: "-c",      template: "-c {v}",
            label: "Packet count limit",
            desc: "Stop after capturing N packets. Useful to avoid huge captures. Leave disabled for unlimited.",
            enabled: false,  hasValue: true,
            placeholder: "100",  value: "100"
          },
          {
            id: "snaplen",   category: "option",
            code: "-s",      template: "-s {v}",
            label: "Snaplen (capture length)",
            desc: "Max bytes to capture per packet. Use 0 for full packet (no truncation). Default is 65535.",
            enabled: false,  hasValue: true,
            placeholder: "0",    value: "0"
          },
          {
            id: "writefile", category: "option",
            code: "-w",      template: "-w {v}",
            label: "Write to .pcap file",
            desc: "Save capture to a file instead of printing. You can open it later in Wireshark.",
            enabled: false,  hasValue: true,
            placeholder: "/tmp/cap.pcap",  value: "/tmp/cap.pcap"
          },
          {
            id: "no_resolve",category: "option",
            code: "-nn",     template: "-nn",
            label: "Don't resolve names (-nn)",
            desc: "Skip DNS and port name resolution. Makes output faster and cleaner — shows raw IPs and ports.",
            enabled: true,   hasValue: false
          },
          {
            id: "verbose",   category: "option",
            code: "-v",      template: "-v",
            label: "Verbose output (-v)",
            desc: "Print extra packet info like TTL, IP ID, checksum, etc.",
            enabled: false,  hasValue: false
          },
          {
            id: "vverbose",  category: "option",
            code: "-vv",     template: "-vv",
            label: "Very verbose (-vv)",
            desc: "Print even more details. Useful for protocol-level debugging.",
            enabled: false,  hasValue: false
          },
          {
            id: "ascii",     category: "option",
            code: "-A",      template: "-A",
            label: "Print ASCII payload (-A)",
            desc: "Show packet payload as ASCII text. Useful for HTTP/clear-text protocols.",
            enabled: false,  hasValue: false
          },
          {
            id: "hex_ascii", category: "option",
            code: "-X",      template: "-X",
            label: "Hex + ASCII payload (-X)",
            desc: "Show packet payload in both HEX and ASCII format. Best for deep inspection.",
            enabled: false,  hasValue: false
          },
          {
            id: "ethernet",  category: "option",
            code: "-e",      template: "-e",
            label: "Show Ethernet headers (-e)",
            desc: "Print MAC addresses (Layer 2). Useful for ARP issues or VLAN debugging.",
            enabled: false,  hasValue: false
          },
          {
            id: "timestamp", category: "option",
            code: "-tt",     template: "-tt",
            label: "Unix timestamp (-tt)",
            desc: "Print timestamps as Unix epoch. Useful for log correlation with external tools.",
            enabled: false,  hasValue: false
          },
          // --- FILTER EXPRESSIONS (joined with 'and') ---
          {
            id: "host_filter",  category: "expr",
            code: "host",       template: "host {v}",
            label: "Host IP filter",
            desc: "Capture traffic TO or FROM this IP (bidirectional). Example: host 192.168.1.1",
            enabled: false,  hasValue: true,
            placeholder: "192.168.1.1",  value: ""
          },
          {
            id: "src_filter",   category: "expr",
            code: "src",        template: "src {v}",
            label: "Source IP",
            desc: "Capture only traffic coming FROM this specific source IP.",
            enabled: false,  hasValue: true,
            placeholder: "10.0.0.1",  value: ""
          },
          {
            id: "dst_filter",   category: "expr",
            code: "dst",        template: "dst {v}",
            label: "Destination IP",
            desc: "Capture only traffic going TO this specific destination IP.",
            enabled: false,  hasValue: true,
            placeholder: "8.8.8.8",  value: ""
          },
          {
            id: "port_filter",  category: "expr",
            code: "port",       template: "port {v}",
            label: "Port (src or dst)",
            desc: "Capture traffic on this port — either as source or destination.",
            enabled: false,  hasValue: true,
            placeholder: "443",  value: ""
          },
          {
            id: "src_port",     category: "expr",
            code: "src port",   template: "src port {v}",
            label: "Source Port",
            desc: "Capture traffic originating from this specific source port.",
            enabled: false,  hasValue: true,
            placeholder: "1024",  value: ""
          },
          {
            id: "dst_port",     category: "expr",
            code: "dst port",   template: "dst port {v}",
            label: "Destination Port",
            desc: "Capture traffic targeting this specific destination port.",
            enabled: false,  hasValue: true,
            placeholder: "80",  value: ""
          },
          {
            id: "net_filter",   category: "expr",
            code: "net",        template: "net {v}",
            label: "Network / Subnet",
            desc: "Capture all traffic within this network range. Use CIDR notation: 10.0.0.0/24",
            enabled: false,  hasValue: true,
            placeholder: "10.0.0.0/24",  value: ""
          },
          {
            id: "proto_tcp",    category: "proto",
            code: "tcp",        template: "tcp",
            label: "Protocol: TCP only",
            desc: "Limit capture to TCP traffic only. Excludes UDP, ICMP, etc.",
            enabled: false,  hasValue: false
          },
          {
            id: "proto_udp",    category: "proto",
            code: "udp",        template: "udp",
            label: "Protocol: UDP only",
            desc: "Limit capture to UDP traffic only. Useful for DNS, SNMP, RADIUS.",
            enabled: false,  hasValue: false
          },
          {
            id: "proto_icmp",   category: "proto",
            code: "icmp",       template: "icmp",
            label: "Protocol: ICMP only",
            desc: "Limit capture to ICMP (ping, traceroute). Useful to debug connectivity issues.",
            enabled: false,  hasValue: false
          },
          {
            id: "not_ssh",      category: "proto",
            code: "not port 22",template: "not port 22",
            label: "Exclude SSH traffic",
            desc: "Filter out your own SSH management session from the capture. Very useful to reduce noise.",
            enabled: false,  hasValue: false
          }
        ]
      }
    ]
  },

  // ==============================
  // FW MONITOR BUILDER (flag-based)
  // ==============================
  {
    category: "FW Monitor Builder",
    commands: [
      {
        id: "fwmon_builder",
        type: "flags",
        label: "fw monitor",
        desc: "Build a fw monitor capture with filters",
        buildMode: "fwmonitor",
        flags: [
          // --- OPTIONS ---
          {
            id: "outfile",      category: "option",
            code: "-o",         template: "-o {v}",
            label: "Save to .pcap file",
            desc: "Write capture output to a pcap file. Open with Wireshark for graphical analysis.",
            enabled: false,  hasValue: true,
            placeholder: "/tmp/fwmon.pcap",  value: "/tmp/fwmon.pcap"
          },
          {
            id: "position",     category: "option",
            code: "-p",         template: "-p {v}",
            label: "Capture position",
            desc: "Where in the inspection chain to capture: i=inbound pre-chain, o=outbound post-chain, I=inbound post-chain, O=outbound pre-chain. Use 'all' for all positions.",
            enabled: false,  hasValue: true,
            placeholder: "all",  value: "all"
          },
          {
            id: "count_fw",     category: "option",
            code: "-c",         template: "-c {v}",
            label: "Packet count limit",
            desc: "Stop capture after N packets. Prevents the capture from running forever.",
            enabled: false,  hasValue: true,
            placeholder: "100",  value: "100"
          },
          // --- FILTER EXPRESSIONS (go into -e 'accept ...;') ---
          {
            id: "src_ip",       category: "expr",
            code: "src=",       template: "src={v}",
            label: "Source IP",
            desc: "Capture packets from this specific source IP address.",
            enabled: false,  hasValue: true,
            placeholder: "10.0.0.1",  value: ""
          },
          {
            id: "dst_ip",       category: "expr",
            code: "dst=",       template: "dst={v}",
            label: "Destination IP",
            desc: "Capture packets going to this specific destination IP address.",
            enabled: false,  hasValue: true,
            placeholder: "8.8.8.8",  value: ""
          },
          {
            id: "host_any",     category: "expr",
            code: "host()",     template: "host({v})",
            label: "Host IP (any direction)",
            desc: "Capture packets where this IP is either source OR destination. Equivalent to tcpdump 'host'.",
            enabled: false,  hasValue: true,
            placeholder: "192.168.1.1",  value: ""
          },
          {
            id: "src_dst_pair", category: "expr_raw",
            code: "src+dst",    template: "src={src} and dst={dst}",
            label: "Source → Destination pair",
            desc: "Capture traffic from a specific source to a specific destination IP.",
            enabled: false,  hasValue: false,
            extraValues: [
              { name: "src", label: "Source IP",      placeholder: "10.0.0.1",  value: "" },
              { name: "dst", label: "Destination IP", placeholder: "8.8.8.8",   value: "" }
            ]
          },
          {
            id: "port_fw",      category: "expr",
            code: "port=",      template: "port={v}",
            label: "Port (src or dst)",
            desc: "Capture traffic on this port. fw monitor uses dport/sport for direction-specific filtering.",
            enabled: false,  hasValue: true,
            placeholder: "443",  value: ""
          },
          {
            id: "dport_fw",     category: "expr",
            code: "dport=",     template: "dport={v}",
            label: "Destination Port",
            desc: "Capture traffic going TO this specific destination port.",
            enabled: false,  hasValue: true,
            placeholder: "443",  value: ""
          },
          {
            id: "sport_fw",     category: "expr",
            code: "sport=",     template: "sport={v}",
            label: "Source Port",
            desc: "Capture traffic originating FROM this specific source port.",
            enabled: false,  hasValue: true,
            placeholder: "1024",  value: ""
          },
          {
            id: "proto_tcp_fw", category: "proto",
            code: "proto=6",    template: "proto=6",
            label: "Protocol: TCP only (6)",
            desc: "Limit capture to TCP protocol (IP proto 6).",
            enabled: false,  hasValue: false
          },
          {
            id: "proto_udp_fw", category: "proto",
            code: "proto=17",   template: "proto=17",
            label: "Protocol: UDP only (17)",
            desc: "Limit capture to UDP protocol (IP proto 17). Useful for DNS, RADIUS, SNMP.",
            enabled: false,  hasValue: false
          },
          {
            id: "proto_icmp_fw",category: "proto",
            code: "proto=1",    template: "proto=1",
            label: "Protocol: ICMP only (1)",
            desc: "Limit capture to ICMP (IP proto 1). Useful to trace ping/traceroute through the firewall.",
            enabled: false,  hasValue: false
          },
          {
            id: "dir_inbound",  category: "proto",
            code: "ifdir=inbound",  template: "ifdir=inbound",
            label: "Direction: Inbound only",
            desc: "Capture only inbound packets (arriving on the firewall interface).",
            enabled: false,  hasValue: false
          },
          {
            id: "dir_outbound", category: "proto",
            code: "ifdir=outbound", template: "ifdir=outbound",
            label: "Direction: Outbound only",
            desc: "Capture only outbound packets (leaving the firewall interface).",
            enabled: false,  hasValue: false
          }
        ]
      }
    ]
  },

  // ==============================
  // VPN
  // ==============================
  {
    category: "VPN",
    commands: [
      { id:"vpn_tu",       cmd:"vpn tu",             desc:"VPN Tunnel Utility (interactive)" },
      { id:"vpn_debug_on", cmd:"vpn debug ikeon",    desc:"Enable IKE/VPN debug logging" },
      { id:"vpn_debug_off",cmd:"vpn debug ikeoff",   desc:"Disable IKE/VPN debug logging" },
      { id:"vpn_debug_tr", cmd:"vpn debug trunc",    desc:"Truncate VPN debug log file" },
      { id:"vpn_tlist",    cmd:"vpn tu tlist",       desc:"List all VPN tunnels" },
      { id:"ike_sa_tab",   cmd:"fw tab -t IKE_SA_table -s", desc:"Show IKE SA table stats" },
      { id:"vpn_overlap",  cmd:"vpn overlap_encdom", desc:"Check overlapping encryption domains" },
      { id:"vpn_drv",      cmd:"vpn drv stat",       desc:"VPN driver statistics" },
      { id:"cpview_vpn",   cmd:"cpview",             desc:"CPView monitoring (interactive)" }
    ]
  },

  // ==============================
  // LOGGING & DEBUG
  // ==============================
  {
    category: "Logging & Debug",
    commands: [
      { id:"fw_log",       cmd:"fw log",              desc:"Show current active log file" },
      { id:"fw_log_f",     cmd:"fw log -f -t",        desc:"Follow live firewall log (tail)" },
      {
        id:"fw_log_ip",
        cmd:"fw log -n | grep {ip}",
        desc:"Search log for IP",
        params:[{ name:"ip", label:"IP Address to search", default:"1.1.1.1" }]
      },
      { id:"cpinfo_y",     cmd:"cpinfo -y all",       desc:"Show all Check Point versions" },
      { id:"cpinfo_col",   cmd:"cpinfo -o /tmp/cpinfo_$(hostname)_$(date +%Y%m%d).txt", desc:"Collect cpinfo to /tmp/" },
      { id:"fw_debug_off", cmd:"fw ctl debug 0",      desc:"Disable all FW kernel debug" },
      { id:"fw_debug_conn",cmd:"fw ctl debug 0; fw ctl debug -buf 32768; fw ctl debug -m fw + conn drop", desc:"Enable connection/drop debug" },
      { id:"fw_kdebug",    cmd:"fw ctl kdebug -T -f > /tmp/kdebug.txt", desc:"Capture kernel debug to file" },
      { id:"cpstat_fw",    cmd:"cpstat fw",           desc:"Firewall statistics summary" },
      { id:"cpstat_ha",    cmd:"cpstat ha",           desc:"HA statistics summary" },
      { id:"cpstat_vpn",   cmd:"cpstat vpn",          desc:"VPN statistics summary" }
    ]
  },

  // ==============================
  // PERFORMANCE & SYSTEM
  // ==============================
  {
    category: "Performance & System",
    commands: [
      { id:"top_b",     cmd:"top -b -n 1 | head -25",  desc:"Snapshot top (non-interactive)" },
      { id:"free_m",    cmd:"free -m",                  desc:"Memory usage (MB)" },
      { id:"df_h",      cmd:"df -h",                    desc:"Disk usage (human readable)" },
      { id:"vmstat_5",  cmd:"vmstat 1 5",               desc:"Virtual memory stats (5 samples)" },
      { id:"uptime",    cmd:"uptime",                   desc:"System uptime and load" },
      { id:"ps_cpu",    cmd:"ps aux | sort -k3rn | head -20", desc:"Top 20 processes by CPU" },
      { id:"ps_mem",    cmd:"ps aux | sort -k4rn | head -20", desc:"Top 20 processes by Memory" },
      { id:"watch_con", cmd:"watch -n 2 'fw tab -t connections -s'", desc:"Watch connections count (live)" },
      { id:"uname_a",   cmd:"uname -a",                 desc:"Kernel version and system info" },
      { id:"tail_msg",  cmd:"tail -f /var/log/messages", desc:"Follow syslog live" }
    ]
  },

  // ==============================
  // LICENSING
  // ==============================
  {
    category: "Licensing",
    commands: [
      { id:"cplic_print", cmd:"cplic print",    desc:"Show installed licenses" },
      { id:"cplic_check", cmd:"cplic check",    desc:"Verify license integrity" },
      { id:"contract",    cmd:"contract_util show", desc:"Show support contract status" }
    ]
  },

  // ==============================
  // SMARTCENTER / MDS
  // ==============================
  {
    category: "SmartCenter / MDS",
    commands: [
      { id:"mdsstat",    cmd:"mdsstat",        desc:"Show MDS status" },
      { id:"mdsstop",    cmd:"mdsstop",        desc:"Stop MDS services" },
      { id:"mdsstart",   cmd:"mdsstart",       desc:"Start MDS services" },
      {
        id:"mdsenv",
        cmd:"mdsenv {cma_name}",
        desc:"Switch to CMA environment",
        params:[{ name:"cma_name", label:"CMA Name", default:"myCMA" }]
      },
      { id:"cpwd_list",  cmd:"cpwd_admin list", desc:"List CP watchdog processes" },
      { id:"api_status", cmd:"api status",      desc:"Show Management API status" },
      { id:"api_restart",cmd:"api restart",     desc:"Restart Management API" }
    ]
  },

  // ==============================
  // GAIA OS
  // ==============================
  {
    category: "Gaia OS",
    commands: [
      { id:"clish_ver",   cmd:"clish -c 'show version all'",      desc:"Show Gaia version" },
      { id:"clish_iface", cmd:"clish -c 'show interface all'",    desc:"Show all interfaces (clish)" },
      { id:"clish_route", cmd:"clish -c 'show route all'",        desc:"Show routing table (clish)" },
      { id:"clish_dns",   cmd:"clish -c 'show dns'",             desc:"Show DNS config (clish)" },
      { id:"clish_ntp",   cmd:"clish -c 'show ntp active'",      desc:"NTP status (clish)" },
      { id:"cat_hosts",   cmd:"cat /etc/hosts",                   desc:"Show /etc/hosts" },
      { id:"tail_syslog", cmd:"tail -200 /var/log/messages",     desc:"Last 200 lines of syslog" },
      { id:"show_conf",   cmd:"clish -c 'show configuration'",   desc:"Show full Gaia configuration" }
    ]
  },

  // ==============================
  // LINUX COMMANDS
  // ==============================
  {
    category: "Linux Commands",
    commands: [
      { id:"arp_n",       cmd:"arp -n",                  desc:"Show ARP table (no DNS resolution)" },
      { id:"arp_a",       cmd:"arp -a",                  desc:"Show ARP table with hostnames" },
      { id:"ifconfig",    cmd:"ifconfig",                desc:"Show all active interfaces" },
      { id:"ifconfig_a",  cmd:"ifconfig -a",             desc:"Show all interfaces (including down)" },
      { id:"ip_route",    cmd:"ip route",                desc:"Show Linux routing table" },
      { id:"ip_addr",     cmd:"ip addr",                 desc:"Show IP addresses" },
      { id:"netstat_rn",  cmd:"netstat -rn",             desc:"Show routing table (numeric)" },
      { id:"netstat_tulpn",cmd:"netstat -tulpn",          desc:"Show listening ports and PIDs" },
      { id:"ping_google", cmd:"ping 8.8.8.8",            desc:"Ping Google DNS (test internet)" },
      { id:"traceroute",  cmd:"traceroute 8.8.8.8",      desc:"Traceroute to 8.8.8.8" }
    ]
  }

]; // end cpCommands
