/**
 * Pure node-model derivation from a LocalAPI `/status` payload.
 * No UI or service dependencies — menu sections and tests both consume this.
 */

export class TailscaleNode {
    /**
     * @param {object} props
     * @param {string} props.name short hostname (first DNS label)
     * @param {string} props.address primary Tailscale IPv4
     * @param {boolean} props.online
     * @param {boolean} props.offersExit
     * @param {boolean} props.usesExit
     * @param {boolean} props.isSelf
     * @param {boolean} props.isMullvadExitNode
     * @param {string[]} props.groupPath e.g. ["Mullvad", "Norway", "Oslo"]
     */
    constructor({name, address, online, offersExit, usesExit, isSelf, isMullvadExitNode, groupPath}) {
        this.name = name;
        this.address = address;
        this.online = online;
        this.offersExit = offersExit;
        this.usesExit = usesExit;
        this.isSelf = isSelf;
        this.isMullvadExitNode = isMullvadExitNode;
        this.groupPath = groupPath;
    }

    get line() {
        const statusIcon = this.isSelf ? '💻' : this.online ? '🟢' : '⚫';
        return `${statusIcon} ${this.address} ${this.name}`;
    }
}

/**
 * Build the sortable, grouped node list from a status payload.
 * @returns {{nodes: TailscaleNode[], tree: object}}
 *   tree shape: {nodes: TailscaleNode[], subTrees: {[key]: tree}}
 */
export function extractNodes(statusJson) {
    const nodes = [];
    const me = statusJson?.Self;
    if (me?.TailscaleIPs != null) {
        nodes.push(new TailscaleNode({
            name: shortName(me.DNSName),
            address: me.TailscaleIPs[0],
            online: Boolean(me.Online),
            offersExit: Boolean(me.ExitNodeOption),
            usesExit: Boolean(me.ExitNode),
            isSelf: true,
            isMullvadExitNode: false,
            groupPath: [],
        }));
    }
    for (const key of Object.keys(statusJson?.Peer ?? {})) {
        const peer = statusJson.Peer[key];
        const isMullvad = Boolean(peer.Tags?.includes('tag:mullvad-exit-node'));
        let groupPath = [];
        if (isMullvad) {
            groupPath = peer.Location?.Country && peer.Location?.City
                ? ['Mullvad', peer.Location.Country, peer.Location.City]
                : ['Mullvad'];
        }
        if (peer.TailscaleIPs != null) {
            nodes.push(new TailscaleNode({
                name: shortName(peer.DNSName),
                address: peer.TailscaleIPs[0],
                online: Boolean(peer.Online),
                offersExit: Boolean(peer.ExitNodeOption),
                usesExit: Boolean(peer.ExitNode),
                isSelf: false,
                isMullvadExitNode: isMullvad,
                groupPath,
            }));
        }
    }

    nodes.sort(combineSort(
        selfFirst,
        sortProp('online', 'desc'),
        sortArrProp('groupPath'),
        sortProp('name')
    ));

    const tree = {nodes: [], subTrees: {}};
    for (const node of nodes) {
        let level = tree;
        for (const part of node.groupPath) {
            if (!(part in level.subTrees)) {
                level.subTrees[part] = {nodes: [], subTrees: {}};
            }
            level = level.subTrees[part];
        }
        level.nodes.push(node);
    }
    return {nodes, tree};
}

/** LoginName of the owning user, falling back to the self hostname. */
export function getUsername(statusJson) {
    const self = statusJson?.Self;
    if (self?.UserID != null) {
        for (const value of Object.values(statusJson?.User ?? {})) {
            if (value.ID === self.UserID) {
                return value.LoginName;
            }
        }
    }
    return self?.HostName ?? null;
}

/** Name of the exit node currently in use, or null. */
export function activeExitNodeName(nodes) {
    const active = nodes.find((node) => node.usesExit);
    return active ? active.name : null;
}

function shortName(dnsName) {
    return String(dnsName ?? '').split('.')[0];
}

/** true (self) sorts before false; a `<` on booleans cannot express this. */
function selfFirst(a, b) {
    if (a.isSelf === b.isSelf) {
        return 0;
    }
    return a.isSelf ? -1 : 1;
}

function sortProp(prop, direction = 'asc') {
    return function compare(a, b) {
        const [left, right] = direction === 'desc' ? [b[prop], a[prop]] : [a[prop], b[prop]];
        if (left < right) {
            return -1;
        }
        if (right < left) {
            return 1;
        }
        return 0;
    };
}

function sortArrProp(prop) {
    return function compare(a, b) {
        const [left, right] = [a[prop] ?? [], b[prop] ?? []];
        const length = Math.max(left.length, right.length);
        for (let i = 0; i < length; i++) {
            if (left[i] < right[i]) {
                return -1;
            }
            if (right[i] < left[i]) {
                return 1;
            }
        }
        return 0;
    };
}

function combineSort(...comparators) {
    return function compare(a, b) {
        for (const comparator of comparators) {
            const result = comparator(a, b);
            if (result !== 0) {
                return result;
            }
        }
        return 0;
    };
}
