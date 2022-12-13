/*


	
	Plugin for managing, creating, and interacting with Queues.

*/


// Dependencies
const Discord = require('discord.js');
const { crypto_pwhash_STRPREFIX } = require('libsodium-wrappers');
const Queue = require('./Queue');
const Song = require('./Song.js');


/**
 * @type {import('./../../bismo.js').Bismo}
 */
var Bismo = {}


class QueuerAPI {
	/**
	 * QueueId -> Queue
	 * @type {Map<string, Queue>}
	 */
	#Queues = new Map();

	/**
	 * Used to point a guild id to the queue id. Use that queue id to find the actual queue.
	 * @type {Map<string, string>}
	 */
	#GuildIdToQueueIdMap = new Map();
	/**
	 * Used to point a voice channel id to the queue id. Use that queue id to find the actual queue. Updated whenever the Queue BismoVoiceChannel emits `moved`
	 * @type {Map<string, string>}
	 */
	#VoiceChannelIdToQueueIdMap = new Map();


	/**
	 * @typedef {object} SearchParameters
	 * Used to find a queue
	 * @property {string} guildId - Guild the queue is in
	 * @property {string} [queueId] - Actual id of the queue (no brainier)
	 * @property {(Discord.VoiceChannel|string)} [voiceChannel] - Voice channel the queue is currently playing in. (object or id)
	 * @property {Queue.ConstructorOptions} [newQueueOptions] - Options passed to CreateQueue -> new Queue()
	 */

	constructor() {
		this.#Queues = new Map();
		this.#GuildIdToQueueIdMap = new Map();
		this.#VoiceChannelIdToQueueIdMap = new Map();
	}


	/**
	 * Gets a queue using the provided search parameters
	 * @param {(SearchParameters|string)} searchParameters - Either some search parameters OR the guild id OR the queue id OR voice channel id OR the voice channel object.
	 * @return {Queue} queue you're looking for
	 */
	GetQueue(searchParameters) {
		if (searchParameters === undefined)
			return;

		if (searchParameters instanceof Queue) {
			if (!this.#Queues.has(searchParameters.Id)) {
				throw new Error("Invalid queue!");
			} else {
				return searchParameters; // What? Why did they .. okay
			}
		}

		let grrMondays = this;
		function tryThis(value) {
			if (typeof value !== "string")
				return;

			let queueId = value;
			if (grrMondays.#VoiceChannelIdToQueueIdMap.has(value)) {
				queueId = grrMondays.#VoiceChannelIdToQueueIdMap.get(value);
			} else if(grrMondays.#GuildIdToQueueIdMap.has(value)) {
				queueId = grrMondays.#GuildIdToQueueIdMap.get(value);
			}

			return grrMondays.#Queues.get(queueId);
		}

		if (searchParameters instanceof Discord.VoiceChannel)
			return tryThis(value.id);

		if (typeof searchParameters === "object") {
			let queue = tryThis(searchParameters.guildId);
			if (queue instanceof Queue)
				return queue;

			queue = tryThis(searchParameters.queueId);
			if (queue instanceof Queue)
				return queue;

			if (searchParameters.voiceChannel instanceof Discord.VoiceChannel)
				queue = tryThis(searchParameters.voiceChannel.id);
			else
				queue = tryThis(searchParameters.voiceChannel)
			if (queue instanceof Queue)
				return queue;
		}

		return tryThis(searchParameters);
	}



	/**
	 * Additional constructor data
	 * @typedef {object} ConstructorData
	 * @property {[string]} authorId - UserId of the creator of this queue
	 * @property {[number|string]} [queueId] - Id to set the queue to. If empty we generate a new UUID
	 */

	/**
	 * Used to create a new queue (or if one already exists, returns the existing queue)
	 * Only voice channel is needed since that will contain all we need (guild id, voice channel id)
	 * @param {Discord.VoiceChannel} voiceChannel - Voice channel queue will be in
	 * @param {ConstructorData} [options] - Additional options to pass to the Queue constructor
	 * @return {Queue} newly created queue 
	 */
	CreateQueue = function(voiceChannel, options) {
		if (!(voiceChannel instanceof Discord.VoiceChannel))
			throw new TypeError("voiceChannel expected instance of Discord.VoiceChannel.");

		let newQueue = new Queue(voiceChannel, options);

		// Listen for voice channel moves (update the VoiceChannelIdToQueueIdMap)
		let realThis = this;
		newQueue.BismoVoiceChannel.on('moved', (oldChannel, newChannel) => {
			if (realThis.#VoiceChannelIdToQueueIdMap.has(oldChannel.id)) {
				realThis.#VoiceChannelIdToQueueIdMap.delete(oldChannel.id);
			}

			realThis.#VoiceChannelIdToQueueIdMap.set(newChannel.id, newQueue.Id);
		});

		// Clean up on removal
		newQueue.on('destroyed', (queueId) => {
			realThis.#Queues.delete(queueId);


			let gId = [...realThis.#GuildIdToQueueIdMap.keys()].find(key => realThis.#GuildIdToQueueIdMap.get(key) === queueId);
			realThis.#GuildIdToQueueIdMap.delete(gId);

			let vcId = [...realThis.#VoiceChannelIdToQueueIdMap.keys()].find(key => realThis.#VoiceChannelIdToQueueIdMap.get(key) === queueId);
			realThis.#VoiceChannelIdToQueueIdMap.delete(vcId);
		});

		// Add
		this.#Queues.set(newQueue.Id, newQueue);
		this.#GuildIdToQueueIdMap.set(newQueue.GuildId, newQueue.Id);
		this.#VoiceChannelIdToQueueIdMap.set(newQueue.VoiceChannel.id, newQueue.Id);

		return newQueue;
	}


	/**
	 * Deletes (destroys) a queue)
	 * @param {(Queue|SearchParameters|string|Discord.VoiceChannel)} queue - Either the Queue, search parameters OR the guild id OR the queue id OR voice channel id OR the voice channel object.
	 */
	DeleteQueue(queue) {
		queue = this.GetQueue(queue);

		if (queue === undefined)
			throw new Error("Unable to find queue with given parameter.");

		queue.Destroy();
	}


	/**
	 * Adds a song to a queue. If you do not have the queue object on hand, and can't (for whatever reason) call `GetQueue`, pass the searchParameters here and we'll find it for you.
	 * If you provide a Discord.VoiceChannel in the searchParameters, we'll even create it for you.
	 * @param {Song} song - Song object to add to the queue
	 * @param {(Queue|SearchParameters|string|Discord.VoiceChannel)} queue - Either the Queue, search parameters OR the guild id OR the queue id OR voice channel id OR the voice channel object.
	 * @param {Queue.AddOptions} options - Options to be passed to `Queue.Add()`
	 */
	AddSong(song, queue, options) {
		if (!(song instanceof Song))
			throw new TypeError("song must be an instance of Song")
		
		let foundQueue;
		if (queue instanceof Queue) {
			if (!this.#Queues.has(queue.Id)) {
				queue.Add(song);
			}
		} else
			foundQueue = this.GetQueue(queue);

		if (foundQueue === undefined && queue != undefined) {
			if (queue instanceof Discord.VoiceChannel)
				foundQueue = this.CreateQueue(queue, queue.newQueueOptions);
			else if (queue.voiceChannel instanceof Discord.VoiceChannel)
				foundQueue = this.CreateQueue(queue.voiceChannel, queue.newQueueOptions);
			else {
				throw new Error("Unable to find queue and unable to create a new one.");
			}
		}

		return foundQueue.Add(song, options);
	}

	/**
	 * Checks if a user id (in a given guild) has permissions to preform an action
	 * @param {string} guildId - Guild to check permissions in (message.guildId)
	 * @param {string} userId - User to check permissions for
	 * @param {string} permission - Permission we're checking for
	 */
	HasPermission(guildId, userId, permission) {
		let internalName = Object.keys(this.Permissions).find(key => this.Permissions[key] === permission);
		let defaultValue = this.PermissionDefaults[internalName];
		let userValue = Bismo.Permissions.UserHasPermission(guildId, userId, permission);

		return (userValue === undefined)? defaultValue : userValue; // Return default if user does not have it set, otherwise user permission
	}



	// Queuer permission strings
	Permissions = Object.freeze({
		Create: "queuer.manage.create",
		Delete: "queuer.manage.delete",
		Disconnect: "queuer.manage.disconnect",
		SetVolume: "queuer.playback.volume",
		Play: "queuer.playback.play",
		Pause: "queuer.playback.pause",
		Stop: "queuer.playback.stop",
		Repeat: "queuer.playback.repeat",
		RepeatQueue: "queuer.playback.repeat.queue",
		RepeatSong: "queuer.playback.repeat.song",
		Next: "queuer.playback.next",
		VoteNext: "queuer.playback.next.vote",
		Previous: "queuer.playback.previous",
		VotePrevious: "queuer.playback.previous.vote",
		Add: "queuer.manage.add",
		Remove: "queuer.manage.remove",
		Move: "queuer.manage.move",
		Shuffle: "queuer.manage.shuffle",
		Save: "queuer.save",
		SaveToGuild: "queuer.save.guild",
		SaveToPersonal: "queuer.save.personal",
		Load: "queuer.load",
		LoadFromGuild: "queuer.load.guild",
		LoadFromPersonal: "queuer.load.personal",
	});

	// Default queuer permissions
	PermissionDefaults = Object.freeze({
		Create: true,
		Delete: true,
		Disconnect: true,
		SetVolume: false,
		Play: true,
		Pause: true,
		Stop: true,
		Repeat: true,
		RepeatQueue: true,
		RepeatSong: true,
		Next: true,
		VoteNext: true,
		Previous: true,
		VotePrevious: true,
		Add: true,
		Remove: true,
		Move: true,
		Shuffle: true,
		Save: undefined,
		SaveToGuild: false,
		SaveToPersonal: true,
		Load: undefined,
		LoadFromGuild: false,
		LoadFromPersonal: true,
	});

	// Default queuer permissions if the user IS NOT in the queue voice channel
	PermissionsNotInVoiceChannel = Object.freeze({
		Create: true,
		Delete: true,
		Disconnect: true,
		SetVolume: false,
		Play: false,
		Pause: false,
		Stop: false,
		Repeat: false,
		RepeatQueue: false,
		RepeatSong: false,
		Next: false,
		VoteNext: false,
		Previous: false,
		VotePrevious: false,
		Add: true,
		Remove: false,
		Move: false,
		Shuffle: false,
		Save: undefined,
		SaveToGuild: false,
		SaveToPersonal: true,
		Load: undefined,
		LoadFromGuild: false,
		LoadFromPersonal: true,
	});

	// Not permitted messages
	PermissionUnauthorizedMessages = Object.freeze({
		Create: "You do not have permissions to create a queue.",
		Delete: "You do not have permissions to delete a queue.",
		Disconnect: "You do not have permissions to make the bot disconnect from the voice channel.",
		SetVolume: "You do not have permissions to change the playback volume.",
		Play: "You do not have permissions to play the queue.",
		Pause: "You do not have permissions to pause the queue.",
		Stop: "You do not have permissions to stop the queue.",
		Repeat: "You do not have permissions to change the repeat settings of the queue.",
		RepeatQueue: "You do not have permissions to enable queue repeat.",
		RepeatSong: "You do not have permissions to enable song repeat.",
		Next: "You do not have permissions to skip this song.",
		VoteNext: "You do not have permissions to vote skip this song.",
		Previous: "You do not have permissions to go back to the previous song.",
		VotePrevious: "You do not have permissions to vote to go back to the previous song.",
		Add: "You do not have permissions to add a song.",
		Remove: "You do not have permissions to remove a song.",
		Move: "You do not have permissions to change the order of songs.",
		Shuffle: "You do not have permissions to shuffle the queue.",
		Save: "You do not have permissions to save this queue at all.",
		SaveToGuild: "You do not have permissions to save this queue for other guild members.",
		SaveToPersonal: "You do not have permissions to save this queue for yourself.",
		Load: "You do not have permissions to load a saved queue at all.",
		LoadFromGuild: "You do not have permissions to load a queue from this guild's saved queues.",
		LoadFromPersonal: "You do not have permissions to load a queue from your saved queues.",
	});

}

/** @type QueuerAPI */
const Queuer = new QueuerAPI();


/*

	End of Queuer API.

	Begin command handling .. o-o

*/




/**
 * @param {import('./../../bismo.js').BismoCommandExecuteData} message
 */
function MainHandler(message) {
	var gA = function (a) { return message.args.length>a? message.args[a] : undefined; }

	/** @type {Discord.VoiceChannel} */
	let userVC = message.guild.members.cache.get(message.authorID).voice?.channel;

	let song = message.parser.IsPresent("song")? message.parser.GetArgument("song") : gA(1);
	let queue = Queuer.GetQueue({
		guildId: message.guildId,
		voiceChannel: userVC
	});


	message.message.delete();
	if (queue === undefined) {
		message.Reply("No queue found!");
		return;
    }



	function UserMustBeInVoiceChannel() {
		if (userVC === undefined) {
			message.Reply("You must be in a voice channel to use that command.");
			return false;
		}
		return true;
	}
	function hasPermission(permission) {
		let perm = Queuer.HasPermission(message.guildId, message.authorID, permission);
		let permNoVC = Queuer.HasPermission(message.guildId, message.authorID, permission + ".outsidevc");

		if (userVC?.id !== queue?.VoiceChannel?.id || userVC === undefined) {
			return permNoVC; // User has permission to preform action outside the VC?
		} else {
			return perm; // User has permission to preform action
		}
	}




	// Which command is this?
	let cmd = message.args[0];
	// Does not require voice channel connection:
	if (cmd == "end" || cmd == "leave" || cmd == "quit" || cmd == "destroy") {
		if (hasPermission(Queuer.Permissions.Delete))
			queue.Destroy();

	} else if (cmd == "disconnect") {
		if (hasPermission(Queuer.Permissions.Disconnect))
			queue.Disconnect();

	} else if (cmd == "play" || cmd == "resume") {
		if (hasPermission(Queuer.Permissions.Play))
			queue.Play(song);

	} else if (cmd == "pause") {
		if (hasPermission(Queuer.Permissions.Pause))
			queue.Pause();

	} else if (cmd == "p") {
		// play pause
		if (queue.Paused) {
			if (hasPermission(Queuer.Permissions.Pause))
				queue.Pause();
		} else {
			if (hasPermission(Queuer.Permissions.Play))
				queue.Play(song);
		}

	} else if (cmd == "next" || cmd == "skip") {
		if (hasPermission(Queuer.Permissions.Next))
			queue.Next();

	} else if (cmd == "previous" || cmd == "prev" || cmd == "back") {
		if (hasPermission(Queuer.Permissions.Previous))
			queue.Previous();

	} else if (cmd == "stop") {
		if (hasPermission(Queuer.Permissions.Stop))
			queue.Stop();

	} else if (cmd == "move") {
		if (hasPermission(Queuer.Permissions.Move)) {
			if (!message.parser.IsPresent("to"))
				message.Reply("You need to specify `-to <song number>` in your command!");
			if (!message.parser.IsPresent("song"))
				message.Reply("You need to specify `-song <song number>` in your command!");

			let toSong = message.parser.GetArgument("to");
			queue.Move(song, toSong, message.parser.GetArgument("options"));
		}
	} else if (cmd == "shuffle") {
		if (hasPermission(Queuer.Permissions.Shuffle)) {
			let setting = gA(1);
			if (setting !== undefined) {
				setting = setting.toLowerCase();
				if (setting == "enable" || setting == "on" || setting == "true")
					queue.Shuffle(true);
				else if (setting == "disable" || setting == "off" || setting == "false")
					queue.Shuffle(false);
				else
					queue.Shuffle();
			}
		}

	} else if (cmd == "repeat") {
		let repeatPerm = hasPermission(Queuer.Permissions.Repeat);
		let queueRepeatPerm = hasPermission(Queuer.Permissions.RepeatQueue);
		let songRepeatPerm = hasPermission(Queuer.Permissions.RepeatSong);

		if (repeatPerm !== false && (queueRepeatPerm !== false || songRepeatPerm !== false)) {
			// We can either repeat the queue, song, or both.
			let setting = gA(1);
			if (setting !== undefined)
				setting = setting.toLowerCase();

			if (setting == "queue" || setting == "1")
				setting = 1;
			else if (setting == "song" || setting == "2")
				setting = 2;
			else if (setting == "disable" || setting == "off" || setting == "false")
				setting = 0;
			else {
				// toggle
				if (queue.Repeat == 2)
		        	setting = 0;
				else
		        	setting = queue.Repeat + 1;
			}

			if (setting == 0)
				queue.Repeat(0);
			else if (setting == 1) {
				if (queueRepeatPerm === true) {
					queue.Repeat(1);
				} else if (songRepeatPerm === true) {
					queue.Repeat(2);
				} else {
					queue.Repeat(0);
				}
			} else if (setting == 2) {
				if (songRepeatPerm === true) {
					queue.Repeat(2);
				} else {
					queue.Repeat(0);
				}
			}
		} else {
			// no perm.
		}
	}

}



/**
 * @param {BismoRequests} Requests
 */
function main(Requests) {
	Bismo = Requests.Bismo // The Bismo API

	Bismo.RegisterCommand("q", MainHandler, {
		description: "Manage the voice channel audio queue.",
		helpMessage: "Usage: \`!queuer [options]\`"
						+ "\nOptions:"
						+ "\n\`pause\`: pauses playback"
						+ "\n\`play [-song <number>]\`: resume playback, or plays a given song"
						+ "\n\`stop\`: stops playback (pauses, goes to the beginning of the queue)"
						+ "\n\`next\`: plays the next song"
						+ "\n\`prev\`: plays the previous song"
						+ "\n\`shuffle [enable]\`: shuffles the queue (if enable is not provided, toggles shuffle)."
						+ "Enable can be any of the following: \`enable\`, \`true\`, \`on\`, \`disable\`, \`false\`, \`off\`."

						+ "\n\`repeat [type]\`: toggles repeat for the queue/song (goes off -> queue -> song). Type can be \`off\`, \`queue\`, \`song\`."
						+ "\n\`end\`: destroys the queue, leaves the voice channel"
						+ "\n\`remove -song <number>\`"
						+ "\n\`move -song <number> -to <number> [-options <options>]\`: moves a song behind another song, _options 0: song is placed behind, 1: song placed before, 2: switch the two",
		requireParams: true,
		guildRequried: true,
		slashCommand: false,
	});
}



/**
 * @typedef {object} Exports
 * @property {function} main - Main entry point
 * @property {Manifest} manifest - Plugin details
 * @property {QueuerAPI} api - Plugin API
 */

/**
 * @type {Exports}
 */
module.exports = {
	requests: {},
	main: main,
	manifest: {
		name: "Queuer",
		packageName: "com.watsuprico.queuer",
		author: "Watsuprico",
		date: "12/12/2022",
		version: "2.1"
	},
	api: Queuer
}