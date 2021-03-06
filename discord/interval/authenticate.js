const con = require("../../database");
const config = require("../../config.json");

const colors = {
    aqua: "#00ffff",
    azure: "#f0ffff",
    beige: "#f5f5dc",
    black: "#000000",
    blue: "#0000ff",
    brown: "#a52a2a",
    cyan: "#00ffff",
    darkblue: "#00008b",
    darkcyan: "#008b8b",
    darkgrey: "#a9a9a9",
    darkgreen: "#006400",
    darkkhaki: "#bdb76b",
    darkmagenta: "#8b008b",
    darkolivegreen: "#556b2f",
    darkorange: "#ff8c00",
    darkorchid: "#9932cc",
    darkred: "#8b0000",
    darksalmon: "#e9967a",
    darkviolet: "#9400d3",
    fuchsia: "#ff00ff",
    gold: "#ffd700",
    green: "#008000",
    indigo: "#4b0082",
    khaki: "#f0e68c",
    lightblue: "#add8e6",
    lightcyan: "#e0ffff",
    lightgreen: "#90ee90",
    lightgrey: "#d3d3d3",
    lightpink: "#ffb6c1",
    lightyellow: "#ffffe0",
    lime: "#00ff00",
    magenta: "#ff00ff",
    maroon: "#800000",
    navy: "#000080",
    olive: "#808000",
    orange: "#ffa500",
    pink: "#ffc0cb",
    red: "#ff0000",
    silver: "#c0c0c0",
    yellow: "#ffff00"
};

const randomColor = () => {
    let result;
    let count = 0;
    for (let prop in colors)
        if (Math.random() < 1/++count)
           result = colors[prop];
    return result;
}

const https = require("https");
const {MessageEmbed} = require("discord.js");
const tmi = require("../../twitch/twitch");

const FOLLOWER_REQUIREMENT = 2000;

module.exports = client => {

    setInterval(() => {
        try {
        con.query("select u.id, u.display_name, u.discord_id from auth join user as u on u.id = auth.mod_id;", (err, res) => {
            if (err) {console.error(err);return;}

            res.forEach(mod => {
                con.query("delete from auth where mod_id = ?;", [mod.id]);

                con.query("select mod_streamer.streamer_name as name from mod_streamer where mod_id = ? and active = true;", [mod.id], (err2, res2) => {
                    if (err2) {console.error(err2);return;}

                    https.request({
                        host: "modlookup.3v.fi",
                        path: "/api/user-v3/" + mod.display_name.toLowerCase() + "?limit=2000&cursor="
                    }, response => {
                        let str = '';
        
                        //another chunk of data has been received, so append it to `str`
                        response.on('data', function (chunk) {
                            str += chunk;
                        });
        
                        //the whole response has been received
                        response.on('end', async function () {
                            try {
                                let data = JSON.parse(str.trim());
        
                                if (data.status == 200) {
                                    if (data.hasOwnProperty("channels") && data.channels.length > 0) {
                                        let channels = [];
                                        let allChannelsStr = "";
        
                                        data.channels.forEach(channel => {
                                            if (channel.followers >= FOLLOWER_REQUIREMENT || channel.name === "davintjen") {
                                                channels = [
                                                    ...channels,
                                                    channel.name
                                                ];

                                                allChannelsStr += `\n${channel.name}`;
                                            }
                                        });
        
                                        let finalChannels = [];

                                        let selectedChannels = "";
                                        res2.forEach(streamer => {
                                            selectedChannels += "\n" + streamer.name;

                                            if (channels.includes(streamer.name)) {
                                                finalChannels = [
                                                    ...finalChannels,
                                                    streamer.name
                                                ];

                                                tmi.listenOnChannel(streamer.name);
                                            }
                                        });

                                        let guild = await client.guilds.fetch(config.modsquad_discord);
                                        let member = await guild.members.fetch(mod.discord_id);

                                        if (finalChannels.length === 0) {
                                            const embed = new MessageEmbed()
                                                    .setTitle("Failed to Link!")
                                                    .setDescription("We couldn't add any channels because the channels you mod for and the channels selected don't match.")
                                                    .addField("Detected Channels", "```" + allChannelsStr + "```", true)
                                                    .addField("Selected Channels", "```" + selectedChannels + "```", true);
                                            member.send(embed);
                                            return;
                                        }

                                        member.roles.remove(member.roles.cache).then(() => {

                                            let roles = [];
                                            finalChannels.forEach(channel => {
                                                let role = guild.roles.cache.find(role => role.name.toLowerCase() === channel.toLowerCase());

                                                if (role === null || role === undefined) {
                                                     guild.roles.create({
                                                        data: {
                                                            name: channel.toLowerCase(),
                                                            hoist: true,
                                                            mentionable: true,
                                                            color: randomColor()
                                                        },
                                                        reason: "Role automatically added by ModBot",
                                                    }).then(newRole => {
                                                        member.roles.add(newRole);
                                                    });
                                                } else {
                                                    roles = [
                                                        ...roles,
                                                        role
                                                    ];
                                                }
                                            });

                                            member.roles.add(roles).then(() => {
                                                const embed = new MessageEmbed()
                                                            .setTitle("Account Linked!")
                                                            .setDescription("Your account was linked to Twitch! You should now have full access to TMS.")
                                                            .addField("Added Channels", "```" + selectedChannels + "```");
                                                member.send(embed);
                                            }).catch(() => {
                                                const embed = new MessageEmbed()
                                                            .setTitle("Account Link May Have Failed!")
                                                            .setDescription("The attempt to link your account *may* have failed. The 'not linked' role should be removed, so you should still have access to all channels.");
                                                member.send(embed);
                                            });

                                            
                                        });
                                    }
                                } else {
                                    console.error(data);
                                }
                            } catch (e) {
                                console.error(e);
                            }
                        });
                    }).end();
                });
            });
        });
        } catch (e) {
            console.error(e);
        }
    }, 1000);

}