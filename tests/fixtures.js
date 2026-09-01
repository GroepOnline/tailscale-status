/**
 * Canned LocalAPI payloads mirroring the verified shapes of tailscale 1.102.3
 * (see .compound-engineering/artifacts/evidence/localapi-endpoint-verification-2026-09-01.md).
 */

export const statusFixture = {
    Version: '1.102.3-t9329c3677-mock',
    TUN: true,
    BackendState: 'Running',
    HaveNodeKey: true,
    AuthURL: '',
    TailscaleIPs: ['100.64.0.1', 'fd7a:115c:a1e0::1'],
    Health: [],
    MagicDNSSuffix: 'tailnet.ts.net.',
    Self: {
        ID: 'nSELF0000000000CNTRL',
        StableID: 'self-stable',
        HostName: 'laptop',
        DNSName: 'laptop.tailnet.ts.net.',
        Online: true,
        TailscaleIPs: ['100.64.0.1', 'fd7a:115c:a1e0::1'],
        UserID: 100,
        ExitNode: false,
        ExitNodeOption: false,
    },
    User: {
        '100': {ID: 100, LoginName: 'joep@example.com', DisplayName: 'Joep'},
    },
    Peer: {
        nPEER1: {
            ID: 'nPEER10000000000CNTRL',
            HostName: 'nas',
            DNSName: 'nas.tailnet.ts.net.',
            Online: true,
            TailscaleIPs: ['100.64.0.2'],
            UserID: 100,
            ExitNode: false,
            ExitNodeOption: true,
        },
        nPEER2: {
            ID: 'nPEER20000000000CNTRL',
            HostName: 'printer',
            DNSName: 'printer.tailnet.ts.net.',
            Online: false,
            TailscaleIPs: ['100.64.0.3'],
            UserID: 100,
            ExitNode: false,
            ExitNodeOption: false,
        },
        nPEER3: {
            ID: 'nPEER30000000000CNTRL',
            HostName: 'mullvad-no-oslo-1',
            DNSName: 'mullvad-no-oslo-1.tailnet.ts.net.',
            Online: true,
            TailscaleIPs: ['100.64.0.4'],
            UserID: 200,
            ExitNode: false,
            ExitNodeOption: true,
            Tags: ['tag:mullvad-exit-node'],
            Location: {Country: 'Norway', City: 'Oslo'},
        },
        nPEER4: {
            ID: 'nPEER40000000000CNTRL',
            HostName: 'exit-active',
            DNSName: 'exit-active.tailnet.ts.net.',
            Online: true,
            TailscaleIPs: ['100.64.0.5'],
            UserID: 100,
            ExitNode: true,
            ExitNodeOption: true,
        },
    },
};

export const prefsFixture = {
    ControlURL: 'https://controlplane.tailscale.com',
    RouteAll: true,
    ExitNodeID: '',
    ExitNodeIP: '100.64.0.5',
    ExitNodeAllowLANAccess: false,
    CorpDNS: true,
    RunSSH: false,
    WantRunning: true,
    LoggedOut: false,
    ShieldsUp: false,
};

export const profilesFixture = [
    {
        ID: 'ce7e',
        Key: 'profile-ce7e',
        Name: 'joep@example.com',
        NetworkProfile: {MagicDNSName: 'tailnet.ts.net.', DomainName: 'example.com', DisplayName: 'Example'},
        UserProfile: {ID: 100, LoginName: 'joep@example.com', DisplayName: 'Joep'},
    },
    {
        ID: 'aa11',
        Key: 'profile-aa11',
        Name: 'work@example.org',
        NetworkProfile: {MagicDNSName: 'work.ts.net.', DomainName: 'example.org', DisplayName: 'Work'},
        UserProfile: {ID: 200, LoginName: 'work@example.org', DisplayName: 'Work'},
    },
];

export const currentProfileFixture = profilesFixture[0];

export const waitingFilesFixture = [
    {Name: 'report.pdf', Size: 2048},
    {Name: 'img with spaces.png', Size: 512},
];

export const fileTargetsFixture = [
    {Node: {StableID: 'peer1-stable', Name: 'nas.tailnet.ts.net.'}},
];
