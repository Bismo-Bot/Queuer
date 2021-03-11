
/*
	 __
	| / . /
	|=\   \  _ _   _
	|_/ | / / | \ |_| .... A Bad Rats playing bot


	BCommands are a just some essential commands for the bot.
	Use this as an example on how to create a plugin (or improve on its design)

	214: 3:34

	seconds: total%60
	minutes: round(total/60)
	hours: total/60/60
*/

var Bismo = {} // Bismo API, provided to use in the main function (under the Requests packet)

const Plugin = {
	linkcodes: [],
	queue: [],			// Per-Guild data goes here, has info such as the song queue, active, vc, etc.
	voiceChannels: {},	// For force leaves
}


// Dependencies
const ytdl = require('ytdl-core');
const yts = require('yt-search');
Plugin.queue = new Map();




function mainHandler(message) {
	var args = message.args;
	var gA = function(a) { return a!=null ? a : ""; } // g(et)A(rg)

	var cmd = gA(args[0]);
	var serverQueue = Plugin.queue.get(message.guild.id);

	if (cmd == "end" || cmd == "stop") {
		// never mind lol
		// force leave the VC
		if (Plugin.voiceChannels[message.guild.id] != undefined) {
			if (Plugin.voiceChannels[message.guild.id].vc != undefined)
				if (Plugin.voiceChannels[message.guild.id].vc.leave != undefined)
					Plugin.voiceChannels[message.guild.id].vc.leave();
			
			if (Plugin.voiceChannels[message.guild.id].connection != undefined)
				if (Plugin.voiceChannels[message.guild.id].connection.dispatcher != undefined)
					if (Plugin.voiceChannels[message.guild.id].connection.dispatcher.end != undefined)
						Plugin.voiceChannels[message.guild.id].connection.dispatcher.end();
		}

		if (!serverQueue)
			return message.reply("Nothing to end..?");

		serverQueue.songs = []; // Cleared
	
	} else if (cmd == "queue") {
		if (!serverQueue)
			return message.reply("No current queue.");


		var items = serverQueue.songs.length;
		if (items > 5) // limit to 5
			items = 5;

		var str = "Now playing: `" + serverQueue.songs[0].title + "`\n";
		for (var i = 1; i<items; i++) {
			str = str + i + ": `" + serverQueue.songs[i].title + "`\n";
		}
		str = str + "_(There's a total of " + serverQueue.songs.length + " songs queued currently.)_";

		return message.reply(str);

	} else if (cmd == "skip") {
		if (!serverQueue)
			return message.reply("Nothing to skip..?");

		serverQueue.songs.shift();
		Plugin.play(message.guild.id, serverQueue.songs[0], serverQueue);

	} else {
		message.reply("Unsupported option. Please use `stop`, `queue`, or `skip`.");
	}
}


Plugin.play = function(guildID, song, serverQueue) {
	console.log("Playing: gID: " + guildID + " || song: " + song);

	if (song == undefined) {
		serverQueue.voiceChannel.leave();
		Plugin.queue.delete(guildID);
		return;
	}

	var dispatcher = serverQueue.connection
		.play(ytdl(song.url))
		.on('finish', () => {
			serverQueue.songs.shift();
			Plugin.play(guildID, serverQueue.songs[0], serverQueue);
		})
		.on('error', error => {
			console.log(error);
			// output to channel?
		});

	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
	serverQueue.textChannel.send("Now playing: `" + song.title + "`.");
}


function playHandler(message) {
	var args = message.args;
	var gA = function(a) { return a!=null ? a : ""; } // g(et)A(rg)

	// var link = args.join(' ');
	var link = gA(args[0]);
	if (link = "")
		return;

	const voiceChannel = message.member.voice.channel;
	if (!voiceChannel)
		return message.reply("You must join a voice channel first.");

	const permissions = voiceChannel.permissionsFor(message.client.user);
 	if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
		return message.reply("I cannot join and speak in your voice channel, try a different one.");
	}

	// do song

	function cont(link) {
		ytdl.getInfo(link).then( songInfo => {
			const song = {
				title: songInfo.videoDetails.title,
				url: songInfo.videoDetails.video_url,
				length: songInfo.videoDetails.lengthSeconds,
			};

			var serverQueue = Plugin.queue.get(message.guild.id);

			if (!serverQueue) {
				var queueContruct = {
					textChannel: message.channel,
					voiceChannel: voiceChannel,
					connection: null,
					songs: [],
					volume: 5,
					playing: true,
				};

				Plugin.voiceChannels[message.guild.id] = {
					vc: voiceChannel
				};


				queueContruct.songs.push(song);
				
				Plugin.queue.set(message.guild.id, queueContruct);

				try {
					voiceChannel.join().then(connection => {
						queueContruct.connection = connection;
						Plugin.voiceChannels[message.guild.id].connection = connection;
						Plugin.play(message.guild, queueContruct.songs[0], queueContruct);
					});
				} catch (err) {
					console.log(err);
					Plugin.queue.delete(message.guild.id);
					return message.reply("Failed to connect to VC!");
				}
			} else {
				serverQueue.songs.push(song);
				return message.reply("`" + song.title + "` has been added to the queue.");
			}
		});
	}
	

	if (args.length > 1 || !link.startsWith("https://youtu")) {
		// do search
		yts( args.join(' '), (err, r) => {
			link = r.videos[0].videoId;
			console.log(r.videos[0]);
		})
	} else {
		cont(link);
	}
}



function main(Requests) {
	Bismo = Requests.Bismo // The Bismo API


	Bismo.registerCommand("yt", mainHandler, "Start or end a YouTube session.", "Usage:\n"
		+ "`!yt [option]`\n"
		+ "		`start`: Not needed, setups the queue.\n"
		+ "		`skip`: Skips a song.\n"
		+ "		`queue`: Prints the queue (next 5 songs)\n"
		+ "		`vskip`: Votes to skip a song.\n", {
			guildRequried: true,
		})

	Bismo.registerCommand("ytplay", playHandler, "Play YouTube videos in voice chat!", "Usage:\n"
		+ "`!ytplay [video url / title]`", {
			guildRequried: true,
		});


}


module.exports = {
	requests: {

	},
	main: main,
	manifest: {
		name: "YouTube Player",
		author: "Watsuprico",
		date: "02/28/2021",
		version: "1"
	},
	api: Plugin
}