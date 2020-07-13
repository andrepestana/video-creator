
const fs = require('fs');
const { exec } = require("child_process");


const config = JSON.parse(fs.readFileSync('./config.json'));

const imageFiles = fs.readdirSync(config.sourceImagesPath).filter(fn => fn.endsWith(config.sourceImagesExtension));
const audioFiles = fs.readdirSync(config.sourceAudiosPath).filter(fn => fn.endsWith(config.sourceAudiosExtension));

const timesForTheAudioToRepeat = calculateTimesSongRepeatsBasedOnImagesPresentation() 

let createPresentationStepOutput = createPresentation();
console.log(`Renaming ${createPresentationStepOutput} to ${config.outputBaseFileName}${config.outputFileName+config.outputVideoExtension}`)
fs.renameSync(createPresentationStepOutput, config.outputBaseFileName+config.outputFileName+config.outputVideoExtension)

function createPresentation() {
    let createPresentationOutput = `${config.outputBaseFileName}_tmp_presentation${config.outputVideoExtension}`;
    let selectedImageFiles = getImageFiles();

    let createPresentationCommandLine = "ffmpeg -y \\\n";
    for (let loopIdx = 0; loopIdx < selectedImageFiles.length; loopIdx++) {
        createPresentationCommandLine += `-loop 1 -t ${config.slideDisplayTimeInSec} -i ${config.sourceImagesPath}${selectedImageFiles[loopIdx]} \\\n`;
    }
    if(audioFiles.length) {
        for (let audioRepeatIdx = 0; audioRepeatIdx < timesForTheAudioToRepeat; audioRepeatIdx++) {
            for (let audioIdx = 0; audioIdx < audioFiles.length; audioIdx++) {
                createPresentationCommandLine += `-i ${config.sourceAudiosPath}${audioFiles[audioIdx]} \\\n`;
            }
        }
    }

    // Video effects
    createPresentationCommandLine += `-filter_complex "\\\n`;
    let effectTimeLeave = config.slideDisplayTimeInSec - config.fadeEffectTimeInSec;
    for (let fadeIdx = 0; fadeIdx <= selectedImageFiles.length - 2; fadeIdx++) {
        createPresentationCommandLine += `[${fadeIdx + 1}]format=yuva444p, fade=d=${config.fadeEffectTimeInSec}:t=in:alpha=1,setpts=PTS-STARTPTS+${effectTimeLeave}/TB[f${fadeIdx}]; \\\n`;
        effectTimeLeave += config.slideDisplayTimeInSec - config.fadeEffectTimeInSec;
        if(fadeIdx == selectedImageFiles.length) {
            let startFadeOut = (calculateVideoDurationBasedOnImagesPresentation() - 3)
            createPresentationCommandLine += `fade=type=in:duration=2,fade=type=out:duration=3:start_time=${startFadeOut}" `
        }
    }
    createPresentationCommandLine += `[0][f0]overlay[bg1]; \\\n`;

    let overlayIdx = 1;
    for (; overlayIdx <= selectedImageFiles.length - 3; overlayIdx++) {
        createPresentationCommandLine += `[bg${overlayIdx}][f${overlayIdx}]overlay[bg${overlayIdx + 1}]; \\\n`;
    }
    createPresentationCommandLine += `[bg${overlayIdx}][f${overlayIdx}]overlay,format=yuv420p`
    
    config.drawTexts.forEach((drawText) => {
        createPresentationCommandLine += `, drawtext=fontfile=${drawText.drawTextFontFile}: \\\n` +
        `text='${drawText.titleVideoText}': fontcolor=${drawText.drawTextFontColor}: shadowcolor=${drawText.drawTextShadowColor}: shadowx=${drawText.drawTextShadowX}: shadowy=${drawText.drawTextShadowY}: fontsize=${drawText.drawTextFontSize}: box=1: boxcolor=black@0: \\\n` +
        `boxborderw=5: x=(${drawText.drawTextX}): y=(${drawText.drawTextY}) `
    })
    
    let startFadeOut = (calculateVideoDurationBasedOnImagesPresentation() - config.fadeOutAtVideoEndDuration)
    createPresentationCommandLine += `,fade=type=in:duration=${config.fadeInAtVideoStartDuration},fade=type=out:duration=${config.fadeOutAtVideoEndDuration}:start_time=${startFadeOut}[v] "`
    createPresentationCommandLine += ` -map "[v]" \\\n`;

    // Audio effects
    if(audioFiles.length) {
        createPresentationCommandLine += `-filter_complex '`;
        for (let timesToRepeatIdx = 0; timesToRepeatIdx < timesForTheAudioToRepeat; timesToRepeatIdx++) {
            for (let audioIdx = 0;audioIdx < audioFiles.length; audioIdx++) {
                createPresentationCommandLine += `[${(timesToRepeatIdx * audioFiles.length) + audioIdx  + selectedImageFiles.length}:0]`;
            }
        }
        createPresentationCommandLine += `concat=n=${(timesForTheAudioToRepeat * audioFiles.length)}:v=0:a=1`
        
        if(config.fadeInAtVideoStartDuration) {
            createPresentationCommandLine += `,afade=t=in:ss=0:d=${config.fadeInAtVideoStartDuration} `
        }
        if(config.fadeOutAtVideoEndDuration) {
            createPresentationCommandLine += `,afade=t=out:st=${startFadeOut}:d=${config.fadeOutAtVideoEndDuration}`
        }
        createPresentationCommandLine += `[out]' -map '[out]' ` 
    }

    // Options
    createPresentationCommandLine += ` -shortest -movflags +faststart ${createPresentationOutput}`;

    console.log('Generating ',createPresentationOutput);
    require('child_process').execSync(createPresentationCommandLine, {maxBuffer: 1024 * 1024 * 5, stdio: 'inherit'} )

    console.log('End of Video Processing ---------------------------------------------------------------------------');
    return createPresentationOutput
}

function calculateTimesSongRepeatsBasedOnImagesPresentation() {
    if(audioFiles.length) {
        let totalProvidedAudio = getTotalAudioDuration();
        if(totalProvidedAudio == 0) {
            throw 'Error while getting audio files.'
        }
        let timesForTheAudioToRepeat = calculateVideoDurationBasedOnImagesPresentation()/totalProvidedAudio
        return Math.ceil(timesForTheAudioToRepeat)
    } else {
      return 0  
    }
}

function getTotalAudioDuration() {
    let totalProvidedAudio = 0;
    for (let audioId = 0; audioId < audioFiles.length; audioId++) {
        let checkSongDurationCommandLine = `ffprobe -loglevel error -show_entries format=duration -of default=nk=1:nw=1 ${config.sourceAudiosPath}${audioFiles[audioId]}`;
        totalProvidedAudio += parseFloat(require('child_process').execSync(checkSongDurationCommandLine));
    }
    return totalProvidedAudio;
}

function calculateVideoDurationBasedOnImagesPresentation() {
    return (imageFiles.length * (config.slideDisplayTimeInSec-2));
}


function getImageFiles() {
    let randomImageFiles = [];
    let orderedImageFiles = JSON.parse(JSON.stringify(imageFiles));
    if(config.selectRandomImages) {
        while (orderedImageFiles.length) {
            let randomItemIndex = Math.floor(Math.random() * orderedImageFiles.length);
            let randomItem = orderedImageFiles[randomItemIndex];
            randomImageFiles.push(randomItem);
            orderedImageFiles.splice(randomItemIndex, 1);
        }
    } else {
        return orderedImageFiles;
    }
    return randomImageFiles;
}
