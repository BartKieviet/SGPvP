function SGStorage( universe ) {
    this.universe = universe;
};

// A specification of the stuff we keep in persistent storage.
// 'u' is true for parameters set once for all universes.
// 'd' is the default value.

SGStorage.prototype.PARAM_DEFINITION = {
    version: { u: true, d: 0 },
    keymap: { u: true, d: null },
    rtid: { u: false, d: null }, // retreat tile id
    lkap: { u: false, d: null }, // last known armour points
    lkba: { u: false, d: null }, // last known bots available
    ql: { u: false, d: '' },
    targeting: { u: false,
                 d: { ql: { includeFactions: {},
                            excludeFactions: {},
                            includeAlliances: {},
                            excludeAlliances: {},
                            includeCharacters: {},
                            excludeCharacters: {} },
                      include: { ids: {}, names: {} },
                      exclude: { ids: {}, names: {} },
                      prioritiseTraders: false,
                      retreatTile: null } },
    armour: { u: false, d: { safe: null, max: null, level: 5 } }
};

// Request retrieval of named values from persistent storage.  Once retrieved,
// these will be available as own properties of the SGStorage instance.
//
// "names" is an array of strings.  "callback" is a function to be called when
// the requested values are available; it will receive a single parameter, a
// reference to this SGStorage object.

SGStorage.prototype.get = function( names, callback ) {
    var storageNames = {},
        specs = this.PARAM_DEFINITION,
        prefix = this.universe + '-',
        i, end, name, spec;

    for ( i = 0, end = names.length; i < end; i++ ) {
        name = names[ i ];
        spec = specs[ name ];
        storageNames[ spec.u ? name : prefix + name ] = name;
    }

    this.rawGet( Object.keys(storageNames), onValues.bind(this) );

    function onValues( values ) {
        var sname, value;
        for ( sname in storageNames ) {
            name = storageNames[ sname ];
            spec = specs[ name ];
            value = values[ sname ];
            if( typeof(value) == 'undefined' )
                value = spec.d;
            this[ name ] = value;
        }
        callback( this );
    }
}

// Store all properties of the given object both as properties of the SGStorage
// instance, and in persistent storage.

SGStorage.prototype.set = function( settings ) {
    var o = new Object(),
        specs = this.PARAM_DEFINITION,
        prefix = this.universe + '-',
        name, storageName, value;

    for( name in settings ) {
        storageName = specs[name].u ? name : prefix + name;
        value = settings[ name ];
        this[ name ] = value;
        o[ storageName ] = value;
    }

    this.rawSet( o );
};

// Update configuration.  We don't do this automatically because we don't want
// to trigger an unnecessary fetch.  Instead, we retrieve the config version
// along with our normal parameters, and if we detect we need to fix it, we call
// this from SGMain and reload.
SGStorage.prototype.migrate = function( callback ) {

    // The configuration prior to V40 stored only one armour level, called
    // "points".  We now store two, safe and max, with max being the old points.
    // If the user had defined any "win" actions, we get the safe level from one
    // of these.  Otherwise, we set safe equal to max.
    this.rawGet(
        [ 'keymap', 'artemis-armour', 'orion-armour', 'pegasus-armour' ],
        onValues.bind( this ) );

    function onValues( entries ) {
        var safe;

        if ( entries.keymap )
            safe = this.fixKeymap( entries.keymap ).safe;

        fixArmour( 'artemis', entries['artemis-armour'], safe );
        fixArmour( 'orion', entries['orion-armour'], safe );
        fixArmour( 'pegasus', entries['pegasus-armour'], safe );

        entries.version = 40;
        console.log( 'FIXED', entries );
        this.rawSet( entries, callback );
    }

    function fixArmour( name, armour, safe ) {
        if ( armour ) {
            if ( armour.points != undefined ) {
                armour.max = armour.points;
                delete armour.points;
            }
            if ( armour.safe == undefined ) {
                if ( safe === undefined || safe > armour.max )
                    armour.safe = armour.max;
                else
                    armour.safe = safe;
            }
        }
    }
}

// Go over the supplied keymap and fix old entries with bad formatting.
// This is done when migrating a configuration, and also when importing one,
// because it may be old.
SGStorage.prototype.fixKeymap = function( keymap ) {
    var winrx = /^(win(?:Raid|B|BRaid)?,)(\d+),(.*)$/,
    safes = [],
        key, action, m, safe;

    for ( key in keymap ) {
        action = keymap[ key ];
        switch ( action ) {
        case 'bots':
            keymap[ key ] = 'bots,m';
            break;
        case 'testBots':
            keymap[ key ] = 'testBots,m';
            break;
        default:
            m = winrx.exec( action );
            if ( m ) {
                safes.push( m[2] );
                keymap[ key ] = m[1] + 's,' + m[3];
            }
        }
    }

    if ( safes.length > 0 )
        safe = Math.max.apply( Math, safes );

    return { safeArmour: safe }
}
