interface AttackMap {
    type: string;
    id: string;
    spec_version: string;
    objects: Array<AttackObject>;
}
interface AttackObject {
    aliases: Array<string>;
    created: string;
    description: string;
    external_references: Array<ExternalReference>;
    id: string;
    kill_chain_phases: Array<KillChainPhase>;
    modified: string;
    name: string;
    revoked: boolean;
    type: string;
    x_mitre_aliases: Array<string>;		// same function as "aliases" key, but for some reason this is also here
    x_mitre_is_subtechnique: boolean;
    x_mitre_deprecated: boolean;
}
interface ExternalReference {
    source_name: string;
    external_id: string;
    url: string;
}
interface Group {
    aliases: Array<string>;
    description: {
        short: string;
        long: string;
    };
    id: string;
    name: string;
    url: string;
}
interface KillChainPhase {
    kill_chain_name: string;
    phase_name: string;
}
interface Matrix {
    created: string;
    description: string;
    modified: string;
    name: string;
}
interface Mitigation {
    description: {
        short: string;
        long: string;
    };
    id: string;
    name: string;
    url: string;
}
interface Software {
    aliases: Array<string>;
    description: {
        short: string;
        long: string;
    };
    id: string;
    name: string;
    url: string;
}
interface Tactic {
    description: {
        short: string;
        long: string;
    };
    id: string;
    name: string;
    url: string;
}
interface Technique {
    deprecated: boolean;
    description: {
        short: string;
        long: string;
    };
    id: string;
    name: string;
    parent: Technique | undefined;
    revoked: boolean;
    subtechnique: boolean;
    tactics: Array<string>;
    url: string;
}
