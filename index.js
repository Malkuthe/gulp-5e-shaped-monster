'use strict';

var through       = require('through2');
var gutil         = require('gulp-util');
var yaml          = require('js-yaml');
var xtend         = require('xtend');
var BufferStreams = require('bufferstreams');
var removeMD      = require('remove-markdown');
var PluginError   = gutil.PluginError;
var PLUGIN_NAME   = 'gulp-5e-monster-shaped';


function yaml2json(buffer, options) {
  var contents = buffer.toString('utf8');
  var ymlOptions = {schema: options.schema, filename: options.filename};
  var ymlMonster = options.safe ? yaml.safeLoad(contents, ymlOptions) : yaml.load(contents, ymlOptions);
  var monster = {};
  monster.name = ymlMonster.name;
  monster.size = firstCap(ymlMonster.size);
  monster.type = firstCap(ymlMonster.type) + ( ymlMonster.subtype ? " (" + ymlMonster.subtype + ")" : "" );
  monster.alignment = ymlMonster.alignment;
  monster.AC = ymlMonster.ac + ( ymlMonster.armor ? " (" + ymlMonster.armor + ")" : "" );
  monster.HP = ymlMonster.hp;
  monster.speed = ymlMonster.speed;
  monster.strength = ymlMonster.abilities.str;
  monster.dexterity = ymlMonster.abilities.dex;
  monster.constitution = ymlMonster.abilities.con;
  monster.intelligence = ymlMonster.abilities.int;
  monster.wisdom = ymlMonster.abilities.wis;
  monster.charisma = ymlMonster.abilities.cha;
  monster.challenge = ymlMonster.cr.toString();

  if (ymlMonster.traits) {
    monster.traits = [];
    for (const prop in ymlMonster.traits) {
      const trait = ymlMonster.traits[prop];
      var traitObj = {}
      traitObj.name = trait.name;
      traitObj.text = removeMD(trait.description);
      if (trait.uses) traitObj.recharge = trait.uses; 
      monster.traits.push(traitObj);
    }
  }

  if (ymlMonster.actions || ymlMonster.attacks) {
    monster.actions = [];
    if (ymlMonster.multiattack) {
      monster.actions.push({
        name: "Multiattack",
        text: removeMD(ymlMonster.multiattack.description)
      })
    }

    for (const prop in ymlMonster.actions) {
      const action = ymlMonster.actions[prop];
      var actionObj = {}
      actionObj.name = action.name;
      actionObj.text = removeMD(action.description);
      if (action.uses) actionObj.recharge = action.uses;
      monster.actions.push(actionObj);
    }

    for (const prop in ymlMonster.attacks) {
      const attack = ymlMonster.attacks[prop];
      var attackObj = {};
      attackObj.name = attack.name;
      attackObj.text = attack.type + ": ";
      attackObj.text += ( attack.tohit >= 0 ? "+" : "-" ) + attack.tohit + " to hit, ";
      attackObj.text += attack.reach ? "reach " + attack.reach : "";
      attackObj.text += attack.reach && attack.range ? " or " : "";
      attackObj.text += attack.range ? "range " + attack.range : "";
      attackObj.text += ", ";
      attackObj.text += attack.target + ". ";
      attackObj.text += "Hit: " + attack.damage + ( attack.onhit ? " " + attack.onhit : "" );
      if (attack.uses) attackObj.recharge = attack.uses;
      monster.actions.push(attackObj);
    }
  }

  if (ymlMonster.legendaryActions) {
    monster.legendaryPoints = ymlMonster.legendaryPoints ? ymlMonster.legendaryPoints : 3;

    monster.lActions = [];
    for (const prop in ymlMonster.legendaryActions) {
      if (prop == "description") {
        continue;
      }
      const lAction = ymlMonster.legendaryActions[prop];
      var lActionObj = {};
      lActionObj.name = lAction.name;
      lActionObj.text = removeMD(lAction.description);
      lActionObj.cost = lAction.cost ? 1 : lAction.cost;
      monster.lActions.push(lActionObj);
    }
  }

  if (ymlMonster.reactions) {
    monster.reactions = [];
    for (const prop in ymlMonster.reactions) {
      const reaction = ymlMonster.reactions[prop];
      var reactionObj = {};
      reactionObj.name = reaction.name;
      reactionObj.text = removeMD(reaction.description);
      if (reaction.uses) reactionObj.recharge = reaction.uses;
      monster.reactions.push(reactionObj);
    }
  }

  if (ymlMonster.saves) {
    var savesArray = [];
    for (var prop in ymlMonster.saves) {
      var save = ymlMonster.saves[prop]
      var temp = "";
      temp += firstCap(prop);
      temp += save >= 0 ? " +" + save : " -" + save;
      savesArray.push(temp);
    }
    monster.savingThrows = savesArray.join(", ");
  }

  if (ymlMonster.skills) {
    var skillsArray = [];
    for (var prop in ymlMonster.skills) {
      const skill = ymlMonster.skills[prop];
      var temp = prop;
      temp += skill >= 0 ? " +" + skill : " -" + skill;
      skillsArray.push(temp);
    }
    monster.skills = skillsArray.join(", ");
  }

  if (ymlMonster.condition) {
    monster.conditionImmunities = ymlMonster.condition.immunities;
  }

  if (ymlMonster.damage) {
    if (ymlMonster.damage.resistances) {
      monster.damageResistances = ymlMonster.damage.resistances;
    } else if (ymlMonster.damage.immunities) {
      monster.damageImmunities = ymlMonster.damage.immunities;
    } else if (ymlMonster.damage.vulnerabilities) {
      monster.damageVulnerabilities = ymlMonster.damage.vulnerabilities;
    }
  }

  if (ymlMonster.senses) {
    monster.senses = ymlMonster.senses;
  }

  if (ymlMonster.languages) {
    monster.languages = ymlMonster.languages;
  }

  return new Buffer(JSON.stringify(monster, options.replacer, options.space));
}

function firstCap(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function parseSchema(schema) {
  switch (schema) {
    case 'DEFAULT_SAFE_SCHEMA':
    case 'default_safe_schema':
      return yaml.DEFAULT_SAFE_SCHEMA;
    case 'DEFAULT_FULL_SCHEMA':
    case 'default_full_schema':
      return yaml.DEFAULT_FULL_SCHEMA;
    case 'CORE_SCHEMA':
    case 'core_schema':
      return yaml.CORE_SCHEMA;
    case 'JSON_SCHEMA':
    case 'json_schema':
      return yaml.JSON_SCHEMA;
    case 'FAILSAFE_SCHEMA':
    case 'failsafe_schema':
      return yaml.FAILSAFE_SCHEMA;
  }
  throw new PluginError(PLUGIN_NAME, 'Schema ' + schema + ' is not valid');
}

module.exports = function(options) {
  options = xtend({safe: true, replacer: null, space: null}, options);
  var providedFilename = options.filename;

  if (!options.schema) {
    options.schema = options.safe ? yaml.DEFAULT_SAFE_SCHEMA : yaml.DEFAULT_FULL_SCHEMA;
  }
  else {
      options.schema = parseSchema(options.schema);
  }

  return through.obj(function(file, enc, callback) {
    if (!providedFilename) {
      options.filename = file.path;
    }

    if (file.isBuffer()) {
      if (file.contents.length === 0) {
        this.emit('error', new PluginError(PLUGIN_NAME, 'File ' + file.path +
            ' is empty. YAML loader cannot load empty content'));
        return callback();
      }
      try {
        file.contents = yaml2json(file.contents, options);
        file.path = gutil.replaceExtension(file.path, '.json');
      }
      catch (error) {
        this.emit('error', new PluginError(PLUGIN_NAME, error, {showStack: true}));
        return callback();
      }
    }
    else if (file.isStream()) {
      var _this = this;
      var streamer = new BufferStreams(function(err, buf, cb) {
        if (err) {
          _this.emit('error', new PluginError(PLUGIN_NAME, err, {showStack: true}));
        }
        else {
          if (buf.length === 0) {
            _this.emit('error', new PluginError(PLUGIN_NAME, 'File ' + file.path +
                ' is empty. YAML loader cannot load empty content'));
          }
          else {
            try {
              var parsed = yaml2json(buf, options);
              file.path = gutil.replaceExtension(file.path, '.json');
              cb(null, parsed);
            }
            catch (error) {
              _this.emit('error', new PluginError(PLUGIN_NAME, error, {showStack: true}));
            }
          }
        }
      });
      file.contents = file.contents.pipe(streamer);
    }
    this.push(file);
    callback();
  });
};