/*


	
	Plugin for managing, creating, and interacting with Queues.

*/


// Dependencies
const Discord = require('discord.js');
const Queue = require('./Queue.js');
const Song = require('./Song.js');


/**
 * @type {import('./../../src/Bismo.js')}
 */
var Bismo = {}
/**
 * @type {import('./../../src/LogMan.js').Logger}
 */
let log = {};

/**
 * @param {string} name - Name of the json config. This is placed inside the data directory in a special folder for this plugin.
 * @return {object}
 */
let ReadJson = function(name) {}
/**
 * @param {string} data - Data to write to the file.
 * @param {string} name - Name of the json config. This is placed inside the data directory in a special folder for this plugin.
 */
let WriteJson = function(data, name) {};


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
	 * @property {Queue.ConstructorData} [newQueueOptions] - Options passed to CreateQueue -> new Queue()
	 */

	constructor() {
		this.#Queues = new Map();
		this.#GuildIdToQueueIdMap = new Map();
		this.#VoiceChannelIdToQueueIdMap = new Map();
	}

	/**
	 * Used to obtain the stream for a !qplay song
	 * @param {Song} song - Song data 
	 */
	PlaySong = function(song) {
		return song.PluginData.PersistentData.URL
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
			if (typeof value !== "string" || value == undefined)
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
			return tryThis(searchParameters.id);

		if (typeof searchParameters === "object") {
			let queue = tryThis(searchParameters.guildId);
			if (queue instanceof Queue) {
				return queue;
			}

			queue = tryThis(searchParameters.queueId);
			if (queue instanceof Queue)
				return queue;

			if (searchParameters.voiceChannel instanceof Discord.VoiceChannel)
				queue = tryThis(searchParameters.voiceChannel.id);
			else
				queue = tryThis(searchParameters.voiceChannel)

			if (queue instanceof Queue)
				return queue;

			return;
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
		try {
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
		} catch (E) {
			log.error("Error creating a new queue for VC " + voiceChannel?.id);
			log.error(E);
			throw E;
		}
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

	static SaveLocations = Object.freeze({
		// Any members of a guild can load this queue.
		"Guild": 0,
		// Only the author (in any guild) can load this queue.
		"Personal": 2
	})


	/*

	The layout of the saved queues file: 
	
	{
		queues: {
			userId: {
				queueName: {
					songs: [],
				},
			},

			guildId: {
				queueName: {
					songs: [], -- Songs (json) array
				},
			}
		},
	}


	*/

	/**
	 * @typedef {object} QueueStorageOptions
	 * @property {QueuerAPI.SaveLocations} [location=QueuerAPI.SaveLocations.Personal] - Where and who can access this save queue.
	 * @property {string} author - Discord user id of the user that wants to save this queue.
	 */

	/**
	 * Saves a queue to storage.
	 * @param {Queue} queue - The queue to save.
	 * @param {string} name - Friendly name of the queue (think of this like a playlist name).
	 * @param {QueueStorageOptions} [options] - Storage options, such as the guild and username.
	 * @return {void}
	 */
	SaveQueue(queue, name, options) {
		if (!(queue instanceof Queue))
			throw new TypeError("queue expected to be instance of Queue.");
		if (typeof name !== "string")
			throw new TypeError("name expected string got " + (typeof name).toString());
		if (typeof options?.author !== "string")
			throw new TypeError("options.author expected string got " + (typeof options?.author).toString());

		name = name.toLowerCase();

		log.debug("Reading saved queues file.");
		let savedQueues = ReadJson("savedQueues");
		if (savedQueues == undefined)
			savedQueues = {};
		if (savedQueues.queues == undefined)
			savedQueues.queues = {};

		let location = queue.GuildId;
		if (options.location != QueuerAPI.SaveLocations.Guild)
			location = options.author;

		if (savedQueues.queues[location] == undefined)
			savedQueues.queues[location] = {};

		if (savedQueues.queues[location][name] !== undefined)
			throw new Error("A queue by that name already exists.");
		else {
			log.debug("Saving queue " + queue.Id);
			savedQueues.queues[location][name] = {
				songs: queue.ToJson()
			};
		}

		log.debug("Writing saved queues file.");
		WriteJson(savedQueues, "savedQueues");
		return;
	}

	/**
	 * Loads a queue from storage.
	 * @param {string} guildId - The guild to load from, or the author id if not in a guild.
	 * @param {string} name - Friendly name of the queue (think of this like a playlist name).
	 * @param {QueueStorageOptions} [options] - Storage options, such as the guild and username.
	 * @return {string[]|undefined} Array of jsonified songs, or undefined if there were none.
	 */
	LoadQueue(guildId, name, options) {
		guildId = guildId || options?.author;
		if (typeof guildId !== "string")
			throw new TypeError("guildId expected string got " + (typeof guildId).toString());
		if (typeof name !== "string")
			throw new TypeError("name expected string got " + (typeof name).toString());

		name = name.toLowerCase();

		log.debug("Reading saved queues file.");
		let savedQueues = ReadJson("savedQueues");
		if (savedQueues == undefined)
			return undefined;
		if (savedQueues.queues == undefined)
			return undefined;

		if (savedQueues.queues[guildId] == undefined)
			savedQueues.queues[guildId] = {};

		if (savedQueues.queues[guildId][name] != undefined)
			return savedQueues.queues[guildId][name];

		return undefined;
	}

	/**
	 * Deletes a queue from storage.
	 * @param {string} guildId - The guild to load from, or the author id if not in a guild.
	 * @param {string} name - Friendly name of the queue (think of this like a playlist name).
	 * @param {QueueStorageOptions} [options] - Storage options, such as the guild and username.
	 * @return {void}
	 */
	DeleteSavedQueue(guildId, name, options) {
		guildId = guildId || options?.author;
		if (typeof guildId !== "string")
			throw new TypeError("guildId expected string got " + (typeof guildId).toString());
		if (typeof name !== "string")
			throw new TypeError("name expected string got " + (typeof name).toString());

		name = name.toLowerCase();

		log.debug("Reading saved queues file.");
		let savedQueues = ReadJson("savedQueues");
		if (savedQueues == undefined)
			return;
		if (savedQueues.queues == undefined)
			return;

		if (savedQueues.queues[guildId] == undefined)
			savedQueues.queues[guildId] = {};

		if (savedQueues.queues[guildId][name] != undefined)
			delete savedQueues.queues[guildId][name];


		log.debug("Writing saved queues file.");
		WriteJson(savedQueues, "savedQueues");

		return;
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
		Delete: "queuer.delete",
		DeleteFromGuild: "queuer.delete.guild",
		DeleteFromPersonal: "queuer.delete.personal",

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
		Save: true,
		SaveToGuild: false,
		SaveToPersonal: true,
		Load: false,
		LoadFromGuild: false,
		LoadFromPersonal: true,
		Delete: true,
		DeleteFromGuild: false,
		DeleteFromPersonal: true,
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
		Save: true,
		SaveToGuild: false,
		SaveToPersonal: true,
		Load: false,
		LoadFromGuild: false,
		LoadFromPersonal: true,
		Delete: true,
		DeleteFromGuild: false,
		DeleteFromPersonal: true,
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
		LoadFromPersonal: "You do not have permissions to load a queue from your saved queues in this guild.",
		Delete: "You do not have permissions to delete a saved queue at all.",
		DeleteFromGuild: "You do not have permissions to delete a queue from this guild's saved queues.",
		DeleteFromPersonal: "You do not have permissions to delete a queue from your saved queues in this guild.",
	});

}

/** @type QueuerAPI */
const Queuer = new QueuerAPI();


/*

	End of Queuer API.

	Begin command handling .. o-o

*/




/**
 * @param {import('./../../src/CommandExecuteData.js')} message
 */
function MainHandler(message) {
	var gA = function (a) { return message.args.length>a? message.args[a] : undefined; }

	/** @type {Discord.VoiceChannel} */
	let userVC = message.voiceChannel;

	let song = message.parser.IsPresent("song")? message.parser.GetArgument("song") : gA(1);
	let queue = Queuer.GetQueue({
		guildId: message.guildId,
		voiceChannel: userVC
	});

	// Which command is this?
	let cmd = message.args[0];

	message.message.delete();
	if (queue === undefined && (cmd !== "load" && cmd !== "delete")) {
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
		if (userVC?.id !== queue?.VoiceChannel?.id || userVC === undefined) {
			// User has permission to preform action outside the VC?
			return Queuer.HasPermission(message.guildId, message.authorId, permission + ".outsidevc");
		} else {
			// User has permission to preform action
			return Queuer.HasPermission(message.guildId, message.authorId, permission);
		}
	}

	// Does not require voice channel connection:
	if (cmd == "end" || cmd == "leave" || cmd == "quit" || cmd == "destroy") {
		if (hasPermission(Queuer.Permissions.Delete))
			queue.Destroy();
		else
			message.Reply(Queuer.PermissionUnauthorizedMessages.Delete);

	} else if (cmd == "disconnect") {
		if (hasPermission(Queuer.Permissions.Disconnect))
			queue.Disconnect();
		else
			message.Reply(Queuer.PermissionUnauthorizedMessages.Disconnect);

	} else if (cmd == "play" || cmd == "resume") {
		if (hasPermission(Queuer.Permissions.Play))
			queue.Play(song);
		else
			message.Reply(Queuer.PermissionUnauthorizedMessages.Play);

	} else if (cmd == "pause") {
		if (hasPermission(Queuer.Permissions.Pause))
			queue.Pause();
		else
			message.Reply(Queuer.PermissionUnauthorizedMessages.Pause);

	} else if (cmd == "p") {
		// play pause
		if (!queue.Paused) {
			if (hasPermission(Queuer.Permissions.Pause))
				queue.Pause();
			else
				message.Reply(QUeuer.PermissionUnauthorizedMessages.Pause);
		} else {
			if (hasPermission(Queuer.Permissions.Play))
				queue.Play(song);
			else
				message.Reply(QUeuer.PermissionUnauthorizedMessages.Play);
		}

	} else if (cmd == "next" || cmd == "skip") {
		if (hasPermission(Queuer.Permissions.Next))
			queue.Next();
		else
			message.Reply(Queuer.PermissionUnauthorizedMessages.Next);

	} else if (cmd == "previous" || cmd == "prev" || cmd == "back") {
		if (hasPermission(Queuer.Permissions.Previous))
			queue.Previous();
		else
			message.Reply(Queuer.PermissionUnauthorizedMessages.Previous);

	} else if (cmd == "stop") {
		if (hasPermission(Queuer.Permissions.Stop))
			queue.Stop();
		else
			message.Reply(Queuer.PermissionUnauthorizedMessages.Stop);

	} else if (cmd == "move") {
		if (!hasPermission(Queuer.Permissions.Move)) {
			message.Reply(Queuer.PermissionUnauthorizedMessages.Move);
			return;
		}
		if (!message.parser.IsPresent("to"))
			message.Reply("You need to specify `-to <song number>` in your command!");
		if (!message.parser.IsPresent("song"))
			message.Reply("You need to specify `-song <song number>` in your command!");

		let toSong = message.parser.GetArgument("to");
		queue.Move(song, toSong, message.parser.GetArgument("options"));

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
					queue.Shuffle = !queue.Shuffle;
			}
		} else {
			message.Reply(Queuer.PermissionUnauthorizedMessages.Shuffle);
		}

	} else if (cmd == "repeat") {
		let repeatPerm = hasPermission(Queuer.Permissions.Repeat);
		let queueRepeatPerm = hasPermission(Queuer.Permissions.RepeatQueue);
		let songRepeatPerm = hasPermission(Queuer.Permissions.RepeatSong);

		if (repeatPerm !== true && (queueRepeatPerm !== true || songRepeatPerm !== true)) {
			message.reply(Queuer.PermissionUnauthorizedMessages.Repeat);
			return;
		}

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
			queue.Repeat = 0;
		else if (setting == 1) {
			if (queueRepeatPerm === true) {
				queue.Repeat = 1;
			} else if (songRepeatPerm === true) {
				queue.Repeat = 2;
			} else {
				queue.Repeat = 0;
			}
		} else if (setting == 2) {
			if (songRepeatPerm === true) {
				queue.Repeat = 2;
			} else {
				queue.Repeat = 0;
			}
		}
	} else if (cmd == "save") {
		if (!hasPermission(Queuer.Permissions.Save)) {
			message.Reply(Queuer.PermissionUnauthorizedMessages.Save);
			return;
		}

		let location = -1;
		if (hasPermission(Queuer.Permissions.SaveToGuild)) {
			location = QueuerAPI.SaveLocations.Guild;
		} else if (hasPermission(Queuer.Permissions.SaveToPersonal)) {
			location = QueuerAPI.SaveLocations.Personal;
		} else {
			message.Reply(Queuer.PermissionUnauthorizedMessages.Save);
			return;
		}
		let name = gA(1) || "queue";

		let queue = Queuer.GetQueue({
			guildId: message.guildId,
			voiceChannel: message.voiceChannelId
		})

		if (queue == undefined || queue.Songs.length <= 0) {
			message.Reply("There are no songs to save! Try adding a few songs first.");
			return;
		}

		try {
			Queuer.SaveQueue(queue, name, {
				author: message.authorId,
				location: location
			});
		} catch (err) {
			if (err.message.contains("already exists")) {
				message.Reply("Saved queue already exists, try deleting it first.");
			} else {
				throw err;
			}
		}
	} else if (cmd == "load") {
		if (!hasPermission(Queuer.Permissions.Load)) {
			message.Reply(Queuer.PermissionUnauthorizedMessages.Load);
			return;
		}

		let location = -1;
		if (hasPermission(Queuer.Permissions.SaveToGuild)) {
			location = QueuerAPI.SaveLocations.Guild;
		} else if (hasPermission(Queuer.Permissions.SaveToPersonal)) {
			location = QueuerAPI.SaveLocations.Personal;
		} else {
			message.Reply(Queuer.PermissionUnauthorizedMessages.Save);
			return;
		}
		let name = gA(1) || "queue";

		let queue = Queuer.CreateQueue(message.voiceChannel, {
			authorId: message.authorId
		});
		if (queue == undefined) {
			message.Reply("Unable to create the queue 😕");
			return;
		}

		let loadedAnySongs = queue.Load(name, message.authorId, {
			location: location,
		});

		if (!loadedAnySongs)
			message.Reply("No saved queue found!");
		
	} else if (cmd == "delete") {
		if (!hasPermission(Queuer.Permissions.Load)) {
			message.Reply(Queuer.PermissionUnauthorizedMessages.Load);
			return;
		}

		let location = -1;
		let storageUserId = message.guildId;
		if (hasPermission(Queuer.Permissions.SaveToGuild)) {
			location = QueuerAPI.SaveLocations.Guild;
		} else if (hasPermission(Queuer.Permissions.SaveToPersonal)) {
			location = QueuerAPI.SaveLocations.Personal;
			storageUserId = message.authorId;
		} else {
			message.Reply(Queuer.PermissionUnauthorizedMessages.Save);
			return;
		}
		let name = gA(1) || "queue";
		Queuer.DeleteSavedQueue(storageUserId, name, {
			location: location,
			author: message.authorId,
		});
	}


	message.End();
}



/**
 * @param {import('./../../src/CommandExecuteData.js')} message
 */
function PlayAttachedFile(message) {
	let voiceChannel = message.voiceChannel;
	if (!voiceChannel || voiceChannel == undefined)
		return message.Reply("You must join a voice channel first.");

	let permissions = voiceChannel.permissionsFor(message.message.client.user);
 	if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
		return message.Reply("I cannot join and speak in your voice channel, try a different one.");
	}

	console.log(message.message.member.voice);

	message.message.delete();

	let url = message.args[0];
	let title = url

	let attachment = message.message.attachments.first();
	if (attachment && attachment.contentType.startsWith('audio')) {
		url = attachment.url
		title = attachment.name
	}


	if (url !== undefined && message.guild !== undefined) {
		let song = new Song((title !== undefined? title : url), {
			AddedByUserId: message.author.id,
			AddedByUserName: message.author.displayName,
			Artist: message.author.username,
			Duration: 0,
		}, {
			PluginPackageName: "com.watsuprico.queuer",
			MethodName: "PlaySong",
			PersistentData: {
				URL: url
			}
		})

		Queuer.AddSong(song, {
			guildId: message.guild.id,
			voiceChannel: voiceChannel,
			newQueueOptions: { authorId: message.author.id },
		});
	}
}


/**
 * @param {Bismo.PluginSetupObject} requests
 */
function main(requests) {
	Bismo = requests.Bismo // The Bismo API
	log = requests.Log;
	ReadJson = requests.ReadJson;
	WriteJson = requests.WriteJson;

	Bismo.RegisterCommand("q", MainHandler, {
		description: "Manage the voice channel audio queue.",
		helpMessage: "Usage: \`!q [options]\`"
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



	Bismo.RegisterCommand("qplay", PlayAttachedFile, {
		description: "Play an attached audio file in a message.",
		helpMessage: "Usage: \`!qplay [url]\`.\nBe sure to attach an MP3 or other audio file if you do not include a URL!",
		requireParams: false,
		slashCommand: false,
		guildRequired: true,
	})
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
		packageName: "com.bismo.queuer",
		author: "Watsuprico",
		date: "12/12/2022",
		version: "2.1"
	},
	api: Queuer
}