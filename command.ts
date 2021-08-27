// TakumiPro Command.ts version 1.0.0 (2021/08/15)

import * as Discord from 'discord.js';
import * as sqlite3 from 'sqlite3';

let defaultPrefix: string = '!';

class ParseError extends Error {
    argument: Argument;
    constructor(err, argument) {
        super(err)
        this.argument = argument
    }
}

class TooManyArgumentsError extends Error {
    parseError: ParseError;
    constructor(err, parseError) {
      super(err)
      this.parseError = parseError
    }
}

class PermissionError extends Error {
    constructor(err) {
      super(err)
    }
}

// Guild Config Model

interface IGuildConfig {
    id: string
    commandPrefix: string
    customConfig: any
}

class GuildConfig implements IGuildConfig {
    id: IGuildConfig['id'];
    commandPrefix: IGuildConfig['commandPrefix'];
    constructor(guildConfig: IGuildConfig){
        Object.assign(this, guildConfig);
    }
  customConfig: any;
}

// Store
interface IStore {
    isConnected(): Boolean;
}

interface IGuildConfigStore extends IStore {
    getConfig(guildId: string): Promise<IGuildConfig>;
    getAll(): Promise<IGuildConfig[]>;
    setConfig(guildConfig: IGuildConfig): Promise<IGuildConfig>;
    delete(guildId: string): Promise<void>;
    isConnected(): boolean;
}

class GuildConfigStore {
    _client: IGuildConfigStore;

    setClient(client: IGuildConfigStore) {
        this._client = client;
    }

    getConfig(guildId: string): Promise<IGuildConfig> {
        return this._client.getConfig(guildId);
    }

    getAll(): Promise<IGuildConfig[]> {
        return this._client.getAll();
    }

    setConfig(guildConfig: IGuildConfig): Promise<IGuildConfig> {
        return this._client.setConfig(guildConfig);
    }

    delete(guildId: string): Promise<void> {
        return this._client.delete(guildId);
    }

    isConnected(): boolean {
        return this._client.isConnected();
    }
}

class SqliteStore implements IStore {
    _store: sqlite3.Database;

    constructor(path: string) {
      this._store = new sqlite3.Database(path, () => {
        this._store.run(
          'CREATE TABLE IF NOT EXISTS keyvaluestore (key TEXT, value TEXT, PRIMARY KEY("key"))',
        );
      });
    }

    isConnected(): boolean {
      return true;
    }

    setValue(key: string, value: any) {
      return new Promise<void>((resolve: any) => {
        var stmt = this._store.prepare(
          'INSERT OR REPLACE INTO keyvaluestore (key, value) VALUES (?,?)',
        );
        stmt.run(key, value);
        stmt.finalize();
        resolve(value);
      });
    }

    unsetValue(key: string) {
      return new Promise<void>((resolve: any) => {
        var stmt = this._store.prepare('DELETE FROM keyvaluestore where key=?');
        stmt.run(key);
        stmt.finalize();
        resolve();
      });
    }

    getValue(key: string): any {
      return new Promise<any>((resolve: any, reject: any) => {
        this._store.all(
          'SELECT key,value FROM keyvaluestore where key=?',
          [key],
          (err: string, rows: any[]) => {
            if (err) return reject(err);
            if (rows.length > 0) {
              return resolve(rows[0].value);
            } else {
              return resolve();
            }
          },
        );
      });
    }

    listValue(): any {
      return new Promise<any>((resolve: any, reject: any) => {
        this._store.all(
          'SELECT key,value FROM keyvaluestore',
          (err: string, rows: any[]) => {
            if (err) return reject(err);
            const values = [];
            rows.forEach((item: string) => {
              values.push(item);
            });
            resolve(values);
          },
        );
      });
    }
  }

  class GuildConfigSqliteStore extends SqliteStore
  implements IGuildConfigStore {
  constructor(path: string) {
    super(path);
  }

  getConfig(guildId: string): Promise<IGuildConfig> {
    return new Promise<GuildConfig>(async (resolve: any) => {
      const result = await this.getValue(guildId);
      if (typeof result !== 'undefined' && result !== '') {
        return resolve(JSON.parse(result));
      }
      return resolve(null);
    });
  }

  setConfig(guildConfig: IGuildConfig): Promise<IGuildConfig> {
    return new Promise<IGuildConfig>(async (resolve: any) => {
      await this.setValue(guildConfig.id, JSON.stringify(guildConfig));
      const result = await this.getConfig(guildConfig.id);
      return resolve(result);
    });
  }

  getAll(): Promise<IGuildConfig[]> {
    return new Promise<IGuildConfig[]>(async (resolve: any) => {
      const result = await this.listValue();
      const guildConfigs = result.map((item: string) => {
        return JSON.parse(item);
      });
      resolve(guildConfigs);
    });
  }

  delete(guildId: string): Promise<void> {
    return new Promise<void>(async (resolve: any) => {
      await this.unsetValue(guildId);
      resolve();
    });
  }
}



const guildConfigStore = new GuildConfigStore();


class Argument{
    _optional: boolean;
    _name: string;
    _display: string;
    _displayDefault: boolean;
    _default: string;

    constructor(){
        this._optional = false;
        this._name = "_";
        this._display = "_";
        this._displayDefault = true;
        this._default = undefined;
    }

    validate(_1: string): string[] {
        throw new Error("Not Implemented");
    }

    optional(fallback: string, displayDefault = true): Argument{
        this._displayDefault = displayDefault;
        this._default = fallback;
        this._optional = true;
        return this;
    }

    getDefault(): string | number{
        return this._default;
    }

    hasDefault(): boolean{
        return this._default != undefined;
    }

    getManual(): string {
        if(this.isOptional()){
            if(this._displayDefault && this.hasDefault()) {
                return `[${this._display}=${this.getDefault()}]`;
            } else {
                return `[${this._display}]`;
            }
        } else {
            return `<${this._display}>`;
        }
    }

    isOptional(): boolean {
        return this._optional;
    }

    setName(name: string, display: string = undefined): Argument {
        this._display = display === undefined ? name : display;
        if(typeof name !== 'string') throw new Error('Argument of setName must be a string!');
        if(name.length < 1) throw new Error('Argument of setName must have at least 1 char long');
        if (!name.match(/^[a-z0-9_]+$/i)) throw new Error("Argument of setName should contain only chars A-z, 0-9 and _")
        this._name = name
        return this
    }

    getName(): string{
        return this._name;
    }

    static createArgumentType() {
        return {
            string: new StringArgument(),
            number: new NumberArgument(),
            rest: new RestArgument()
        }
    }
}

class StringArgument extends Argument {
    _regex: RegExp;
    _maxlen: number;
    _minlen: number;
    _whitelist: string[];
    _uppercase: boolean;
    _lowercase: boolean;

    constructor() {
        super()
        this._regex = null
        this._maxlen = null
        this._minlen = null
        this._whitelist = null
        this._uppercase = false
        this._lowercase = false
    }

    validate(args: string): string[] {
        const argArray = args.split(" ")
        const str = argArray.shift()
        return this._validate(str||"", argArray.join(" "))
    }

    _validate(arg: string, ...rest: string[]): string[] {
        if (this._uppercase) arg = arg.toUpperCase()
        if (this._lowercase) arg = arg.toLowerCase()
        if (this._minlen !== null && this._minlen > arg.length) throw new ParseError(`String length not greater or equal! Expected at least ${this._minlen}, but got ${arg.length}`, this)
        if (this._maxlen !== null && this._maxlen < arg.length) throw new ParseError(`String length not less or equal! Maximum ${this._maxlen} chars allowed, but got ${arg.length}`, this)
        if (this._whitelist !== null && !this._whitelist.includes(arg)) throw new ParseError(`Invalid Input for ${arg}. Allowed words: ${this._whitelist.join(", ")}`, this)
        if (this._regex !== null && !this._regex.test(arg)) throw new ParseError(`Regex missmatch, the input '${arg}' did not match the expression ${this._regex.toString()}`, this)
        return [arg, ...rest]
    }

    match(regex: RegExp): StringArgument{
        this._regex = regex
        return this
    }

    max(len: number): StringArgument{
        this._maxlen = len;
        return this
    }

    min(len: number): StringArgument{
        this._minlen = len;
        return this;
    }

    forceUpperCase(): StringArgument {
        this._lowercase = false;
        this._uppercase = true;
        return this;
    }

    forceLowerCase(): StringArgument {
        this._lowercase = true;
        this._uppercase = false;
        return this;
    }

    whitelist(words: string[]): StringArgument {
        if(!Array.isArray(this._whitelist)) this._whitelist = []
        this._whitelist.push(...words);
        return this;
    }

}

class RestArgument extends StringArgument {
    validate(args: string): string[]{
        return super._validate(args, "");
    }
}

class NumberArgument extends Argument {
    _min: number;
    _max: number;
    _int: boolean;
    _forcePositive: boolean;
    _forceNegative: boolean;

    constructor() {
        super();
        this._min = null
        this._max = null
        this._int = false
        this._forcePositive = false
        this._forceNegative = false
    }

    validate(args): string[] {
        const argArray = args.split(" ")
        const arg = argArray.shift()|| ""
        const num = parseFloat(arg)
        if (!(/^-?\d+(\.\d+)?$/).test(arg) || isNaN(num)) throw new ParseError(`"${arg}" is not a valid number`, this)
        if (this._min !== null && this._min > num) throw new ParseError(`Number not greater or equal! Expected at least ${this._min}, but got ${num}`, this)
        if (this._max !== null && this._max < num) throw new ParseError(`Number not less or equal! Expected at least ${this._max}, but got ${num}`, this)
        if (this._int && num % 1 !== 0) throw new ParseError(`Given Number is not an Integer! (${num})`, this)
        if (this._forcePositive && num <= 0) throw new ParseError(`Given Number is not Positive! (${num})`, this)
        if (this._forceNegative && num >= 0) throw new ParseError(`Given Number is not Negative! (${num})`, this)
        return [num, argArray.join(" ")]
    }

    min(min: number): NumberArgument{
        this._min = min;
        return this;
    }

    max(max: number): NumberArgument{
        this._max = max;
        return this;
    }

    integer(): NumberArgument{
        this._int = true;
        return this;
    }

    positive(): NumberArgument{
        this._forcePositive = true;
        this._forceNegative = false;
        return this;
    }

    negative(): NumberArgument{
        this._forcePositive = false;
        this._forceNegative = true;
        return this;
    }
}

class CommandBase {
    _collector: Collector;
    _execHandler: any[];
    _help: string;
    _manual: string[];
    _name: string;
    _alias: string[];
    _permissionHandler: any[];

    constructor(cmd: string, collector: Collector) {
        this._collector = collector;
        this._execHandler = [];
        this._help = '';
        this._manual = [];
        this._name = cmd;
        this._alias = [];
        this._permissionHandler = [];
    }

    getUsage(): string{
        throw new Error("Not Implemented");
    }

    getUsageAlias(): string[]{
        throw new Error("Not Implemented");
    }

    hasPermission(_: any): Promise<boolean>{
        throw new Error("Not Implemented");
    }

    validate(_: string): Record<string, any>{
        throw new Error("Not Implemented");
    }

    dispatch(_1: string, _2: ICommandMessage, _3: CommandUtility) {
        throw new Error("Not Implemented");
    }

    alias(...alias: string[]): CommandBase{
        alias = alias.map(a => a.toLowerCase())
        alias.forEach(a => Collector.isValidCommandName(a))
        this._alias.push(...alias.filter(a => this._collector.getAvailableCommands(a)))
        return this;
    }

    getCommandName(): string{
        return this._name
    }

    getAlias(): string[]{
        return this._alias
    }

    getCommandNames(): string[]{
        return [this.getCommandName(), ...this.getAlias()];
    }

    getHelp(): string {
        return this._help;
    }

    help(text: string): CommandBase{
        this._help = text;
        return this;
    }

    hasHelp(): boolean {
        return this._help !== "";
    }

    getManual(): string {
        return this._manual.join("\r\n");
    }

    hasManual(): boolean{
        return this._manual.length > 0;
    }

    checkPermission(callback: any): CommandBase{
        this._permissionHandler.push(callback);
        return this;
    }

    isAllowed(client: any): any{
        return Promise.all(this._permissionHandler.map(cb => cb(client)))
        .then(res => res.every(r => r));
    }

    manual(text: string): CommandBase {
        this._manual.push(text);
        return this;
    }

    clearManual(): CommandBase {
        this._manual = [];
        return this;
    }

    exec(callback: any): CommandBase{
        this._execHandler.push(callback)
        return this;
    }

    async _dispatchCommand(ev: ICommandDispatch){
        if (!(await this.hasPermission(ev.message)))
            throw new PermissionError("no permission to execute this command")
        this._execHandler.forEach(handle => handle(ev.client, ev.arguments, ev.author, ev.message, ev.cmd))
    }
}

class Command extends CommandBase{
    _arguments: any[];
    constructor(cmd: string, collector: Collector){
        super(cmd, collector);
        this._arguments = [];
    }

    alias(...alias: string[]): Command{
       super.alias(...alias);
       return this;
    }

    help(text: string): Command{
        super.help(text)
        return this;
    }

    checkPermission(callback: any): Command{
        super.checkPermission(callback);
        return this;
    }

    manual(text: string): Command {
        super.manual(text);
        return this;
    }

    clearManual(): Command {
        super.clearManual();
        return this;
    }

    exec(callback: any): Command{
        super.exec(callback);
        return this;
    }

    getUsage(): string {
        return `${this.getCommandName()} ${this.getArguments().map(arg => arg.getManual()).join(" ")}`;
    }

    getUsageAlias(): string[]{
        return this._alias.map( alias => {
            return `${alias} ${this.getArguments().map(arg => arg.getManual()).join(" ")}`;
        });
    }

    hasPermission(client: any): any {
        return this.isAllowed(client);
      }

    addArgument(arg: any): Command {
        if(typeof arg === "function") arg = arg(Argument.createArgumentType());
        if(!(arg instanceof Argument)) throw new Error(`Argument type not found`);
        this._arguments.push(arg);
        return this;
    }

    getArguments(): Argument[]{
        return this._arguments;
    }

    validate(args: string): string[] {
        const { result, errors, remaining } = this.validateArgs(args);
        if (remaining.length > 0) throw new TooManyArgumentsError(`Too many argument!`, errors.shift())
        return result;
    }

    dispatch(args: string, ev: ICommandMessage, cmdUtil: CommandUtility) {
        return this._dispatchCommand({
            client: ev.client,
            arguments: this.validate(args),
            author: ev.author,
            message: ev.message,
            cmd: cmdUtil,
        });
    }

    validateArgs(args: string): any{
        args = args.trim();
        const result: any = {};
        const errors: ParseError[] = [];
        this.getArguments().forEach(arg => {
            try {
                const [val, rest] = arg.validate(args);
                result[arg.getName()] = val;
                return args = rest.trim()
            } catch (e) {
                if(e instanceof ParseError && arg.isOptional()){
                    result[arg.getName()] = arg.getDefault()
                    return errors.push(e);
                }
                throw e
            }
        });
        return {result, remaining: args, errors };
    }
}


class Collector {
    _commands: CommandBase[];

    constructor() {
        this._commands = [];
    }

    static isValidCommandName(name: string): boolean {
        if (typeof name !== "string") throw new Error("Command name should be string!");
        if (name.length < 1) throw new Error(`Expect the length of command name more than 1`);
        if ((/\s/).test(name)) throw new Error(`Command "${name}" should not contain spaces!`);
        return true
    }

    static async checkPermissions(commands: CommandBase[], client: any) {
        const result = await Promise.all(commands.map(cmd => cmd.hasPermission(client)))
        return commands.filter((_, i) => result[i])
    }

    registerCommand(name: string) {
        name = name.toLowerCase()
        if (!Collector.isValidCommandName(name))
        throw new Error("Can not create a command with length of 0")
        const cmd = new Command(name, this)
        this._commands.push(cmd)
        return cmd
    }

    getAvailableCommands(name: string) {
        name = name.toLowerCase()
        return this._commands
          .filter(cmd => cmd.getCommandNames().includes(name));
    }

    getAvailableCommandsByPermission(client: any): Promise<CommandBase[]> {
        return Collector.checkPermissions(
          this._commands,
          client
        )
    }

    isPossibleCommand(text: string) :boolean {
        return this._commands.some(cmd => cmd.getCommandName() === text.split(" ")[0])
    }

    isCommandCanSave(cmdName: string) : boolean{
        cmdName = cmdName.toLowerCase();
        Collector.isValidCommandName(cmdName);
        if (this.getAvailableCommands(cmdName).length > 0) return false;
        return true;
    }
}

const collector = new Collector();

class Logger {
    static writeLog(message: string) {
        const logPayload = {
          message: message
        }
        console.log(JSON.stringify(logPayload));
    }
}

export class CommandUtility {
    _guildConfig: IGuildConfig;

    constructor(guildConfig: IGuildConfig) {
        this._guildConfig = guildConfig;
    }

    getCommandPrefix(): string {
        return this._guildConfig.commandPrefix;
    }

    setCommandPrefix(prefix: string): boolean {
        if(!prefix || prefix.length <= 0) return false;
        this._guildConfig.commandPrefix = prefix;
        guildConfigStore.setConfig(this._guildConfig);
        return true;
    }

    isPossibleCommand(text: string) {
        if (text.startsWith(this._guildConfig.commandPrefix)) return true
        return collector.isPossibleCommand(text);
    }

    getAvailableCommandsWithPrefix(name: string){
      const prefix: string = this._guildConfig.commandPrefix;
        if (!name.startsWith(prefix)) return [];
        const cmdName = name.slice(prefix.length); //Remove prefix
        return collector.getAvailableCommands(cmdName);
    }
}

const messageHandler = async (ev: ICommandMessage): Promise<void> => {
    if(ev.mode !== 2) return Logger.writeLog('Chat coming from another source than channel, Just ignored');
    if(!ev.author) return Logger.writeLog('Unknow author, Just ignored');
    if(ev.author.bot) return; //Not handle message from any bot
    if(!ev.message.guild && !ev.message.guild.id) return; // Make sure message came from guild


    let guildConfig: IGuildConfig = await guildConfigStore.getConfig(ev.message.guild.id);
    if(!guildConfig) {
        console.log("Guild config not found create it!");
        guildConfig = new GuildConfig({
            id: ev.message.guild.id,
            commandPrefix: defaultPrefix,
            customConfig: {},
        });
        await guildConfigStore.setConfig(guildConfig);
    }

    const cmdUtil: CommandUtility = new CommandUtility(guildConfig);

    if(
      ev.message.mentions.has(ev.client.user) &&
      (
        ev.message.mentions.roles.size <= 0 &&
        !ev.message.mentions.everyone &&
        ev.message.mentions.channels.size <= 0
      )
    ){
      ev.message.channel.send(`Command prefix is: **${cmdUtil.getCommandPrefix()}**\nUse **${cmdUtil.getCommandPrefix()}help** to get all available command`);
      return;
    }

    if(!cmdUtil.isPossibleCommand(ev.text)) return; // Command not possible

    const match = ev.text.match(new RegExp(`^(?<command>\\S*)\\s*(?<args>.*)\\s*$`, "s"));
    if (!match || !match.groups) throw new Error(`command regex missmatch for '${ev.text}'`);
    const { command, args } = match.groups;
    const commands = cmdUtil.getAvailableCommandsWithPrefix(command);
    if(commands.length === 0) return; //No command actually found


    commands.forEach(async (cmd: CommandBase) => {
        const startTime: number = Date.now();

        try {
            Logger.writeLog(`${ev.author.username}@${ev.message.guild.name} issue command ${cmd.getCommandName()}`);
            await cmd.dispatch(args, ev, cmdUtil);
            Logger.writeLog(`Command "${cmd.getCommandName()}" finnished successfully after ${Date.now() - startTime}ms`);
        } catch(e) {
            Logger.writeLog(`Command "${cmd.getCommandName()}" failed after ${Date.now() - startTime}ms`);

            if (e instanceof PermissionError) {
                Logger.writeLog(`${ev.author.username}@${ev.message.guild.name} missing permission for ${cmd.getCommandName()}`);
                ev.message.reply(
                    `You don't have permission to use this command\n` +
                    `For available command type **${cmdUtil.getCommandPrefix()}help**`
                );
            } else if(e instanceof ParseError) {
                ev.message.reply(
                    `Invalid command usage!\n` +
                    `For usage detail type **${cmdUtil.getCommandPrefix()}help ${cmd.getCommandName()}**`
                );
            } else if(e instanceof TooManyArgumentsError) {
                ev.message.reply(
                    `Invalid command usage!\n` +
                    `For usage detail type **${cmdUtil.getCommandPrefix()}help ${cmd.getCommandName()}**`
                );
            } else {
                ev.message.reply(
                    `Unexpected error, Bot developer doing bad at thier job and should feel bad\nYou should tell him to fix this`
                );
                const match = e.stack.match(new RegExp("^(?<type>\\w+): *(?<msg>.+?)\\s+(at .+?\\(((?<script>\\w+):(?<line>\\d+):(?<row>\\d+))\\))", "s"));
                if (match) {
                    const { type, msg, script, line, row } = match.groups
                    Logger.writeLog(`Unhandled Script Error in Script "${script.endsWith(".js") ? script : `${script}.js`}" on line ${line} at index ${row}`);
                    Logger.writeLog(`${type}: ${msg}`);
                    Logger.writeLog(e.stack);
                } else {
                    Logger.writeLog("Unknow error!\n")
                    Logger.writeLog(e.stack);
                }
            }
        }
    });
}


export const createCommand = (cmdName : string): Command => {
    if (!collector.isCommandCanSave(cmdName)) {
        throw new Error("This command already exist!");
    }
    return collector.registerCommand(cmdName);
}

export const createArgument = (type: string): Argument => {
    const arg = Argument.createArgumentType()[type];
    if(!(arg instanceof Argument))
        throw new Error(`Argument type not found, Available : ${Object.keys(Argument.createArgumentType()).join(", ")}`);
    return arg;
}

export interface ICommandDispatch {
    client: Discord.Client,
    arguments: string[],
    author: Discord.User,
    message: Discord.Message,
    cmd: CommandUtility
}

export class CommandDispatch {
    client: ICommandDispatch['client'];
    arguments: ICommandDispatch['arguments'];
    author: ICommandDispatch['author'];
    message: ICommandDispatch['message'];
    cmd: ICommandDispatch['cmd'];

    constructor(commandDispatch: ICommandDispatch) {
        Object.assign(this, commandDispatch);
    }
}

export interface ICommandMessage {
    client: Discord.Client,
    author: Discord.User,
    channel: Discord.TextChannel | Discord.DMChannel | Discord.NewsChannel,
    mode: number,
    text: string,
    message: Discord.Message,
}

export class CommandMessage {
    client: ICommandMessage['client'];
    author: ICommandMessage['author'];
    channel: ICommandMessage['channel'];
    mode: ICommandMessage['mode'];
    text: ICommandMessage['text'];
    message: ICommandMessage['message'];

    constructor(commandMessage: ICommandMessage) {
        Object.assign(this, commandMessage);
    }
}


createCommand('help')
.help(`Use 'help <command name>' to get more details`)
 .manual(`Display list of usable commands`)
 .manual(`You can specific command name to view how to use (eg !help commandname)`)
 .addArgument(createArgument("string").setName("cmdName").optional(''))
 .exec(async (client: Discord.Client, args: any, _4: Discord.User, message: Discord.Message, cmdUtil: CommandUtility) => {


    if(!args.cmdName || args.cmdName == ''){
        const fixLen = (str: string, len: number) => str + Array(len - str.length).fill('\xa0').join("");
        let length = 0;
        const cmds = (await collector.getAvailableCommandsByPermission(message))
        .filter(cmd => cmd.hasHelp())
        message.reply(`**${cmds.length.toString()}** Commands available for you`);

        const commands = [];
        await Promise.all(cmds.map(async cmd => {
        if (`${cmdUtil.getCommandPrefix()}${cmd.getCommandName()}`.length > length) length = `${cmdUtil.getCommandPrefix()}${cmd.getCommandName()}`.length
        commands.push([`${cmdUtil.getCommandPrefix()}${cmd.getCommandName()}`, cmd.getHelp()])
        //commands.push([cmdLine, cmd.getHelp()]);
        }));
        const init = [[]]
        commands.map(([cmd, help]) => '**' + fixLen(cmd, length) + '**' + '\xa0``' + help + '``')
        .reduce((acc, curr) => {
            if (acc[acc.length - 1].length + acc.join("\n").length + 6 >= 2000) {
                acc[acc.length] = [curr]
            } else {
                acc[acc.length - 1].push(curr)
            }
            return acc
        }, init)
        .forEach(lines => {

            const messageEmbed = {
                "title": `Command List`,
                "description": "\n" + lines.join("\n"),
                "color": 4886754,
                "thumbnail": {
                    "url": client.user.avatarURL()
                },
                "fields": []
            };

            message.channel.send({ embeds: [messageEmbed]});

        });

    } else {
        const getManual = cmd => {
            if (cmd.hasManual()) return cmd.getManual()
            if (cmd.hasHelp()) return cmd.getHelp()
            return "No manual available"
          }
          const cmds = await Collector.checkPermissions(collector.getAvailableCommands(args.cmdName), message)
          if (cmds.length === 0) return message.reply(`Command **${args.cmdName}** not found`);
          cmds.forEach(async cmd => {

                let usageAliasText = '';
                if (cmd.getUsageAlias().length > 0) {
                    const aliasArray = cmd.getUsageAlias().map(alias => {
                        return `${cmdUtil.getCommandPrefix()}${alias}`;
                    });
                    usageAliasText = "```\n**Short Version:**\n```" + aliasArray.join('\n');
                }

                const helpEmbed = {
                    "title": `How to use **${cmdUtil.getCommandPrefix()}${cmd.getCommandName()}**`,
                    "description": "\n**Usage:**\n```" + cmdUtil.getCommandPrefix() + cmd.getUsage() + usageAliasText  + " " + "```\n**Explain:**\n```" + getManual(cmd) +  "```",
                    "color": 4886754,
                    "thumbnail": {
                        "url": client.user.avatarURL()
                    },
                    "fields": []
                };
                message.channel.send({ embeds: [helpEmbed]});
            });
    }
    return null;
 });

export const listen = async (client : Discord.Client, dbPath: string, prefix: string = '!'): Promise<void> => {
    defaultPrefix = prefix;
    guildConfigStore.setClient(new GuildConfigSqliteStore(dbPath));
    client.on('messageCreate', async (ev: Discord.Message) => {
        messageHandler({
            client: client,
            author: ev.author,
            channel: ev.channel as Discord.TextChannel,
            mode: ev.guild ? 2 : 1,
            text: ev.content,
            message: ev
        });
    });


}

export const loadCustomConfig = async (guildId: string) : Promise<any> => {
  return new Promise(async (resolve: Function, _1: Function) => {
    const config = await guildConfigStore.getConfig(guildId);
    return resolve(config.customConfig);
  });
}

export const saveCustomConfig = async (guildId: string, customConfig: any) : Promise<void> => {
  return new Promise(async (resolve: Function, _1: Function) => {
    const config = await guildConfigStore.getConfig(guildId);
    config.customConfig = customConfig;
    await guildConfigStore.setConfig(config);
    return resolve();
  });
}
