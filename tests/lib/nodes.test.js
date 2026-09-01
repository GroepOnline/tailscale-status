import {extractNodes, getUsername, activeExitNodeName} from '../../tailscale-status@maxgallup.github.com/lib/nodes.js';
import {register, assert, assertEqual} from '../harness.js';
import {statusFixture} from '../fixtures.js';

register('nodes: self first, online peers, offline last, mullvad grouped', () => {
    const {nodes} = extractNodes(statusFixture);
    assertEqual(nodes[0].isSelf, true, 'self must sort first');
    assertEqual(nodes[0].name, 'laptop');

    const online = nodes.filter((n) => n.online && !n.isSelf).map((n) => n.name);
    assert(online.length >= 3, 'three online peers expected');

    const printer = nodes.find((n) => n.name === 'printer');
    assertEqual(printer.online, false, 'printer offline');
    assert(nodes.indexOf(printer) > nodes.findIndex((n) => n.name === 'nas'), 'offline sorts after online peers');

    const mullvad = nodes.find((n) => n.name === 'mullvad-no-oslo-1');
    assertEqual(mullvad.groupPath, ['Mullvad', 'Norway', 'Oslo']);
    assertEqual(mullvad.isMullvadExitNode, true);
});

register('nodes: tree nests mullvad under country/city, self at root', () => {
    const {tree} = extractNodes(statusFixture);
    assertEqual(tree.nodes[0].isSelf, true);
    assert('Mullvad' in tree.subTrees, 'mullvad subtree exists');
    assert('Norway' in tree.subTrees['Mullvad'].subTrees, 'country subtree exists');
    assert('Oslo' in tree.subTrees['Mullvad'].subTrees['Norway'].subTrees, 'city subtree exists');
    assertEqual(tree.subTrees['Mullvad'].subTrees['Norway'].subTrees['Oslo'].nodes[0].address, '100.64.0.4');
});

register('nodes: peer without TailscaleIPs is skipped', () => {
    const partial = JSON.parse(JSON.stringify(statusFixture));
    delete partial.Peer.nPEER1.TailscaleIPs;
    const {nodes} = extractNodes(partial);
    assert(!nodes.some((n) => n.name === 'nas'), 'peer without IPs must be skipped');
    assertEqual(nodes.length, 4, 'self + 3 valid peers');
});

register('nodes: mullvad tag without Location groups at ["Mullvad"]', () => {
    const partial = JSON.parse(JSON.stringify(statusFixture));
    delete partial.Peer.nPEER3.Location;
    const {nodes} = extractNodes(partial);
    const mullvad = nodes.find((n) => n.isMullvadExitNode);
    assertEqual(mullvad.groupPath, ['Mullvad']);
});

register('nodes: exit-node state is derivable from status', () => {
    const {nodes} = extractNodes(statusFixture);
    assertEqual(activeExitNodeName(nodes), 'exit-active');
    const withoutExit = nodes.filter((n) => n.name !== 'exit-active');
    assertEqual(activeExitNodeName(withoutExit), null);
});

register('nodes: line renders status emoji + address + name', () => {
    const {nodes} = extractNodes(statusFixture);
    const self = nodes.find((n) => n.isSelf);
    assert(self.line.startsWith('💻'), 'self icon');
    const online = nodes.find((n) => n.name === 'nas');
    assert(online.line.startsWith('🟢'), 'online icon');
    const offline = nodes.find((n) => n.name === 'printer');
    assert(offline.line.startsWith('⚫'), 'offline icon');
    assertEqual(offline.line, '⚫ 100.64.0.3 printer');
});

register('nodes: getUsername resolves LoginName and falls back to hostname', () => {
    assertEqual(getUsername(statusFixture), 'joep@example.com');
    const noUser = {...statusFixture, User: {}};
    assertEqual(getUsername(noUser), 'laptop', 'fallback to HostName');
    assertEqual(getUsername({}), null, 'empty status yields null');
});
