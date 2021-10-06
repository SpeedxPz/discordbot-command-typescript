// TakumiPro Command.ts version 1.2.0 (2021/10/06)

import Discord, { MessageEmbed, Permissions, TextChannel } from 'discord.js';
import { EventEmitter } from 'events';
export const commandLog = new EventEmitter();

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

class Argument {
  _optional: boolean;
  _name: string;
  _display: string;
  _displayDefault: boolean;
  _default: string;

  constructor() {
    this._optional = false;
    this._name = "_";
    this._display = "_";
    this._displayDefault = true;
    this._default = undefined;
  }

  validate(_1: string): string[] {
    throw new Error("Not Implemented");
  }

  optional(fallback: string, displayDefault = true): Argument {
    this._displayDefault = displayDefault;
    this._default = fallback;
    this._optional = true;
    return this;
  }

  getDefault(): string | number {
    return this._default;
  }

  hasDefault(): boolean {
    return this._default != undefined;
  }

  isOptional(): boolean {
    return this._optional;
  }

  getManual(): string {
    if(this.isOptional()) {
      if(this._displayDefault && this.hasDefault()) {
        return `[${this._display}=${this.getDefault()}]`;
      } else {
        return `[${this._display}]`;
      }
    } else {
      return `<${this._display}>`;
    }
  }

  setName(name: string, display: string = undefined): Argument {
    if(typeof name !== 'string') throw new Error('Argument of setName must be a string!');
    if(name.length < 1) throw new Error('Argument of setName must have at least 1 char long');
    if (!name.match(/^[a-z0-9_]+$/i)) throw new Error("Argument of setName should contain only chars A-z, 0-9 and _")

    this._display = display === undefined ? name : display;
    this._name = name

    return this;
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
  _collector: CommandCollector;
  _execHandler: any[];
  _help: string;
  _manual: string[];
  _name: string;
  _alias: string[];
  _permissionHandler: any[];

  constructor(cmd: string, collector: CommandCollector) {
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

  async dispatch(_1: string, _2: ICommandMessage, _3: CommandUtility) {
      throw new Error("Not Implemented");
  }

  alias(...alias: string[]): CommandBase {
    alias = alias.map(a => a.toLowerCase())
    alias.forEach(a => CommandCollector.isValidCommandName(a))
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

  async _dispatchCommand(ev: ICommandDispatch): Promise<void>{
      if (!(await this.hasPermission(ev.message)))
          throw new PermissionError("no permission to execute this command")
      await Promise.all(this._execHandler.map(async (handle: ICommandExecute) => handle(ev.client, ev.arguments, ev.message, ev.cmdUtils)));
      return;
  }
}

class Command extends CommandBase {
  _arguments: Argument[];
  _permissions: Discord.Permissions;

  constructor(cmd: string, collector: CommandCollector) {
    super(cmd, collector);
    this._arguments = [];
    this._permissions = new Permissions();
  }

  alias(...alias: string[]): Command {
    super.alias(...alias);
    return this;
  }

  help(text: string): Command {
    super.help(text)
    return this;
  }

  requireBotPermission(perm: Discord.BitFieldResolvable<Discord.PermissionString, bigint>): Command {
    this._permissions.add(perm);
    return this;
  }

  checkPermission(callback: any): Command {
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

  exec(callback: ICommandExecute): Command {
    super.exec(callback);
    return this;
  }

  getArguments(): Argument[]{
    return this._arguments;
  }

  addArgument(arg: any): Command {
    if(typeof arg === "function") arg = arg(Argument.createArgumentType());
    if(!(arg instanceof Argument)) throw new Error(`Argument type not found`);
    this._arguments.push(arg);
    return this;
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

  validate(args: string): string[] {
    const { result, errors, remaining } = this.validateArgs(args);
    if (remaining.length > 0) throw new TooManyArgumentsError(`Too many argument!`, errors.shift())
    return result;
  }

  getUsage(): string {
    return `${this.getCommandName()} ${this.getArguments().map(arg => arg.getManual()).join(" ")}`;
  }

  getUsageAlias(): string[] {
    return this._alias.map( alias => {
        return `${alias} ${this.getArguments().map(arg => arg.getManual()).join(" ")}`;
    });
  }

  hasPermission(client: any): any {
    return this.isAllowed(client);
  }

  async dispatch(args: string, ev: ICommandMessage, cmdUtil: CommandUtility): Promise<void> {


    const botPermission = ev.message.guild.me.permissionsIn(ev.message.channel as Discord.TextChannel);

    const missing = botPermission.missing(this._permissions);
    if(missing.includes('SEND_MESSAGES')) {
      await ev.message.author.send({
        embeds: [
          new MessageEmbed()
          .setTitle(`Error! Missing Bot Permission`)
          .setDescription(`I didn't have permission to send message on server **${ev.message.guild.name}** channel **#${(ev.message.channel as TextChannel).name}**\nPlease inform the Server Owner to give me permission`)
          .setColor(16711680)
        ]
      })
      return;
    }

    if(missing.length > 0) {
      await ev.message.channel.send({
        embeds: [
          new MessageEmbed()
          .setTitle(`Error! Missing Bot Permission`)
          .setDescription(`Bot require following permission on this server/channel to perform the command`)
          .addField(`Missing Permission`, `${missing.join('\n')}`)
          .setColor(16711680)
        ]
      })
      return;
    }

    return this._dispatchCommand({
      client: ev.client,
      arguments: this.validate(args),
      message: ev.message,
      cmdUtils: cmdUtil,
    });
  }
}

class CommandCollector {
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
    const result = await Promise.all(commands.map(cmd => cmd.hasPermission(client)));
    return commands.filter((_, i) => result[i]);
  }

  registerCommand(name: string): Command {
    name = name.toLowerCase();
    CommandCollector.isValidCommandName(name);
    const cmd: Command = new Command(name, this);
    this._commands.push(cmd);
    return cmd;
  }

  getAvailableCommands(name: string) {
    name = name.toLowerCase();
    return this._commands
    .filter(
      cmd => cmd.getCommandNames().includes(name)
    );
  }

  getAvailableCommandsByPermission(client: any): Promise<CommandBase[]> {
    return CommandCollector.checkPermissions(
      this._commands,
      client
    );
  }

  isPossibleCommand(message: string): boolean {
    return this._commands.some(
      cmd => cmd.getCommandName() === message.split(" ")[0]
    );
  }

  isCommandCanSave(cmdName: string) : boolean{
    cmdName = cmdName.toLowerCase();
    CommandCollector.isValidCommandName(cmdName);
    if (this.getAvailableCommands(cmdName).length > 0) return false;
    return true;
  }
}

export interface ICommandExecute {
  (
    client: Discord.Client,
    args: string[],
    message: Discord.Message,
    cmdUtils: CommandUtility,
  ): Promise<void>;
}

export interface ICommandDispatch {
  client: Discord.Client;
  arguments: string[];
  message: Discord.Message;
  cmdUtils: CommandUtility;
}

export class CommandDispatch {
  client: ICommandDispatch['client'];
  arguments: ICommandDispatch['arguments'];
  message: ICommandDispatch['message'];
  cmdUtils: ICommandDispatch['cmdUtils'];
}

export class ICommandMessage {
  client: Discord.Client;
  message: Discord.Message;
}

export interface GetCommandPrefix {
  (guildId: string): Promise<string>;
}

export interface SetCommandPrefix {
  (guildId: string, prefix: string): Promise<void>;
}

export class CommandUtility {
  _getPrefixCallback: GetCommandPrefix;
  _setPrefixCallback: SetCommandPrefix;

  constructor(
    getPrefixCallback: GetCommandPrefix,
    setPrefixCallback: SetCommandPrefix,
  ) {
    this._getPrefixCallback = getPrefixCallback;
    this._setPrefixCallback = setPrefixCallback;
  }

  async getCommandPrefix(guildId: string): Promise<string> {
    return await this._getPrefixCallback(guildId);
  }

  async setCommandPrefix(guildId: string, prefix: string): Promise<void> {
    return await this._setPrefixCallback(guildId, prefix);
  }

  async isPossibleCommand(guildId: string, message: string): Promise<boolean> {
    const prefix: string = await this.getCommandPrefix(guildId);
    if (message.startsWith(prefix)) return true;
    return false;
  }

  async getAvailableCommands(guildId: string, message: string) {
    const prefix: string = await this.getCommandPrefix(guildId);
    if(!message.startsWith(prefix)) return [];
    const cmdName = message.slice(prefix.length);
    return collector.getAvailableCommands(cmdName);
  }
}


const collector = new CommandCollector();
var defaultPrefix: string = "!";
var getPrefixCallback: GetCommandPrefix = undefined;
var setPrefixCallback: SetCommandPrefix = undefined;
const guildPrefixCache: {[key: string]: string} = {};

const getPrefix = async (guildId: string): Promise<string> => {

  if(guildId in guildPrefixCache) {
    return guildPrefixCache[guildId];
  }

  if(getPrefixCallback) {
    const result: string = await getPrefixCallback(guildId);

    if(!result) {
      await setPrefixCallback(guildId, defaultPrefix);
      return defaultPrefix;
    }

    guildPrefixCache[guildId] = result;
    return result;
  }

  return defaultPrefix;
}

const setPrefix = async (guildId: string, prefix: string): Promise<void> => {

  guildPrefixCache[guildId] = prefix;

  if(setPrefixCallback) {
    return setPrefixCallback(guildId, prefix);
  }

  return;
}

const messageHandler = async (ev: ICommandMessage): Promise<void> => {
  const isGuildMessage: boolean = ev.message.guild ? true : false;
  const message: string = ev.message.content;
  const author: Discord.User = ev.message.author;

  if(!isGuildMessage) return;
  if(!author) return;
  if(author.bot) return;
  if(!ev.message.guild && !ev.message.guild.id) return;



  const guildId = ev.message.guild.id;
  const cmdUtil: CommandUtility = new CommandUtility(getPrefix, setPrefix);

  if(
    ev.message.mentions.has(ev.client.user) &&
    (
      ev.message.mentions.roles.size <= 0 &&
      !ev.message.mentions.everyone &&
      ev.message.mentions.channels.size <= 0
    )
  ){
    await ev.message.channel.send(`Command prefix is: **${cmdUtil.getCommandPrefix(guildId)}**\nUse **${cmdUtil.getCommandPrefix(guildId)}help** to get all available command`);
    return;
  }

  if(!(await cmdUtil.isPossibleCommand(guildId, message))) return;
  const match = message.match(new RegExp(`^(?<command>\\S*)\\s*(?<args>.*)\\s*$`, "s"));
  if (!match || !match.groups) throw new Error(`command regex mismatch for '${message}'`);
  const { command, args } = match.groups;
  const commands = await cmdUtil.getAvailableCommands(guildId, command);
  if(commands.length === 0) return;

  commands.forEach(async (cmd: CommandBase) => {
    //const startTime: number = Date.now();

    try {
      await cmd.dispatch(args, ev, cmdUtil);
    } catch (e) {
      const prefix: string = await cmdUtil.getCommandPrefix(guildId);
      if(e instanceof PermissionError) {
        await ev.message.reply(
          [
            `You don't have permission to use this command`,
            `For available command type **${prefix}help**`
          ].join('\n')
        );
      } else if (e instanceof ParseError) {
        await ev.message.reply(
          [
            `Invalid command usage!`,
            `For usage detail type **${prefix}help ${cmd.getCommandName()}**`
          ].join('\n')
        );
      } else if (e instanceof TooManyArgumentsError) {
        await ev.message.reply(
          [
            `Invalid command usage!`,
            `For usage detail type **${prefix}help ${cmd.getCommandName()}**`
          ].join('\n')
        );
      } else {
        const eventTime: number = Date.now();
        await ev.message.reply(
        'Unexpected error occurred, Bot developer doing bad at their job and should feel bad.\n' +
        'You can help me by tell him about this'
        );
        commandLog.emit('exception', e, eventTime);
      }
    }
  });
}


export const createCommand = (cmdName: string): Command => {
  if(!collector.isCommandCanSave(cmdName)) {
    throw new Error("This command already exist!");
  }
  return collector.registerCommand(cmdName);
}

export const createArgument = (type: string): Argument => {
  const arg: Argument = Argument.createArgumentType()[type];
  if(!(arg instanceof Argument)) {
    throw new Error(`Argument type not supported, Available : ${Object.keys(Argument.createArgumentType()).join(", ")}`);
  }
  return arg;
}

export const getManualEmbed = async (client: Discord.Client, cmdName: string, commandPrefix: string): Promise<MessageEmbed> => {

  let helpEmbed: Discord.MessageEmbed;

  const getManual = (cmd) => {
    if (cmd.hasManual()) return cmd.getManual()
    if (cmd.hasHelp()) return cmd.getHelp()
    return 'No Manual available';
  }

  const cmds = await collector.getAvailableCommands(cmdName);
  if (cmds.length === 0) {
    return null;
  }

  cmds.forEach(async cmd => {
    let usageAliasText = '';
    if (cmd.getUsageAlias().length > 0) {
        const aliasArray = cmd.getUsageAlias().map(alias => {
            return `${commandPrefix}${alias}`;
        });
        usageAliasText = "```\n**Short Version:**\n```" + aliasArray.join('\n');
    }

    helpEmbed = new MessageEmbed()
      .setTitle(`How to use **${commandPrefix}${cmd.getCommandName()}**`)
      .setDescription(
        '\n**Usage:**\n```' +
        commandPrefix + cmd.getUsage() +
        usageAliasText + ' ' +
        '```\n**Explain:**\n```' +
        getManual(cmd) +
        '```'
      )
      .setColor(4886754)
      .setThumbnail(client.user.avatarURL());
  });

  return helpEmbed;
}

export const executeCommand = async ( cmd: string, ev: ICommandMessage, cmdUtil: CommandUtility ): Promise<void> => {
  const guildId = ev.message.guild.id;
  cmd = (await cmdUtil.getCommandPrefix(guildId)) + cmd;
  if(!(await cmdUtil.isPossibleCommand(guildId, cmd))) return;
  const match = cmd.match(new RegExp(`^(?<command>\\S*)\\s*(?<args>.*)\\s*$`, "s"));
  if (!match || !match.groups) return;
  const { command, args } = match.groups;
  const commands = await cmdUtil.getAvailableCommands(guildId, command);
  if(commands.length === 0) return;

  commands.forEach(async (cmd: CommandBase) => {

    try {
      await cmd.dispatch(args, ev, cmdUtil);
    } catch (e) {
      if(e instanceof PermissionError) {
        await ev.message.reply(
          `
            You don't have permission to use this command\n
            For available command type **${cmdUtil.getCommandPrefix(guildId)}help**
          `
        );
      } else if (e instanceof ParseError) {
        await ev.message.reply(
          `
            Invalid command usage!\n
            For usage detail type **${cmdUtil.getCommandPrefix(guildId)}help ${cmd.getCommandName()}**
          `
        );
      } else if (e instanceof TooManyArgumentsError) {
        await ev.message.reply(
          `
            Invalid command usage!\n
            For usage detail type **${cmdUtil.getCommandPrefix(guildId)}help ${cmd.getCommandName()}**
          `
        );
      } else {
        const eventTime: number = Date.now();
        await ev.message.reply(
        '``ErrorId: ' + eventTime + '``\n' +
        'Unexpected error occurred, Bot developer doing bad at their job and should feel bad.\n' +
        'You can help me by tell him about this, use **about** command to see contact information'
        );
        commandLog.emit('exception', e, eventTime);
      }
    }
  });

}

export const listen = async (client : Discord.Client, prefix: string = '!'): Promise<void> => {
  defaultPrefix = prefix;




  client.on('messageCreate', async (ev: Discord.Message) => {
    messageHandler({
      client: client,
      message: ev,
    });
  });
  return;
};

export const setCallback = (
  getPrefix: GetCommandPrefix,
  setPrefix: SetCommandPrefix
  ) => {
    getPrefixCallback = getPrefix;
    setPrefixCallback = setPrefix;
};


createCommand('help')
  .help(`Use 'help <command>' to get more details`)
  .manual(`Display list of usable commands`)
  .manual(`You can specific command name to view how to use (eg. help <command name>)`)
  .addArgument(createArgument("string").setName("cmdName").optional(''))
  .exec(async (client: Discord.Client, args: any, message: Discord.Message, cmdUtil: CommandUtility) => {
    const guildId: string = message.guild.id;
    const commandPrefix: string = await cmdUtil.getCommandPrefix(guildId);

    if(!args.cmdName || args.cmdName == '') {
      const cmdsWithHelp = (await collector.getAvailableCommandsByPermission(message)).filter(cmd => cmd.hasHelp());
      const messageContent = `**${cmdsWithHelp.length.toString()}** commands available`;

      const commands = [];

      await Promise.all(
        cmdsWithHelp.map( async (cmd: CommandBase) => {
          commands.push([`${commandPrefix}${cmd.getCommandName()}`, cmd.getHelp()]);
        })
      );

      const embeds = [];

      while(commands.length > 0) {
        const embedArrays = commands.splice(0, 25);
        if(embedArrays) {
          const embed: Discord.MessageEmbed = new MessageEmbed()
            .setTitle('Available Commands')
            .setDescription(`Type \`\`${commandPrefix}help <command name>\`\` for more details`)
            .setColor(4886754)
            .setThumbnail(client.user.avatarURL());

          embedArrays.forEach((item: string[]) => {
            embed.addField(`**${item[0]}**`, item[1], false);
          });

          embeds.push(embed);
        }
      }

      await message.reply({
        content: messageContent,
        embeds: embeds
      });
    } else {

      const getManual = (cmd) => {
        if (cmd.hasManual()) return cmd.getManual()
        if (cmd.hasHelp()) return cmd.getHelp()
        return 'No Manual available';
      }

      const cmds = await CommandCollector.checkPermissions(collector.getAvailableCommands(args.cmdName), message);
      if (cmds.length === 0) {
        await message.reply(`Command **${args.cmdName}** not found`);
        return;
      }

      cmds.forEach(async cmd => {
        let usageAliasText = '';
        if (cmd.getUsageAlias().length > 0) {
            const aliasArray = cmd.getUsageAlias().map(alias => {
                return `${commandPrefix}${alias}`;
            });
            usageAliasText = "```\n**Short Version:**\n```" + aliasArray.join('\n');
        }

        const helpEmbed: Discord.MessageEmbed = new MessageEmbed()
          .setTitle(`How to use **${commandPrefix}${cmd.getCommandName()}**`)
          .setDescription(
            '\n**Usage:**\n```' +
            commandPrefix + cmd.getUsage() +
            usageAliasText + ' ' +
            '```\n**Explain:**\n```' +
            getManual(cmd) +
            '```'
          )
          .setColor(4886754)
          .setThumbnail(client.user.avatarURL());

          await message.reply({
            embeds: [ helpEmbed ],
          })
      });
    }
  });
