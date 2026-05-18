async function fetchNovelContent(url) {
    const response = await fetch(url);

    if (!response.ok) {
        console.error(`Failed to fetch content from ${url}. Status: ${response.status}`);
        return null;
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract episode title
    let episodeTitle = 'Untitled Episode';
    const numElem = doc.querySelector('.ne-num, .ne-title, h1');
    if (numElem) {
        episodeTitle = numElem.textContent.trim();
    }

    // Target content container
    const content = doc.querySelector('.novel-story, .view-content, article, #novel_content, .nd-desc-wrap');
    if (!content) {
        console.error(`Failed to find novel content container on the page: ${url}`);
        return null;
    }

    let cleanedContent = cleanText(content.innerHTML);
    if (cleanedContent.startsWith(episodeTitle)) {
        cleanedContent = cleanedContent.slice(episodeTitle.length).trim();
    }

    return {
        episodeTitle: episodeTitle,
        content: cleanedContent
    };
}

function unescapeHTML(text) {
    const entities = {
        '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'",
        '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '--', '&lsquo;': "'",
        '&raquo;': "'", '&ldquo;': '"', '&rdquo;': '"'
    };

    Object.entries(entities).forEach(([entity, replacement]) => {
        const regex = new RegExp(entity, 'g');
        text = text.replace(regex, replacement);
    });

    return text;
}

function cleanText(text) {
    text = text.replace(/<div>/g, '');
    text = text.replace(/<\/div>/g, '');
    text = text.replace(/<p>/g, '\n');
    text = text.replace(/<\/p>/g, '\n');
    text = text.replace(/<br\s*[/]?>/g, '\n');
    text = text.replace(/<img[^>]*>/gi, '[skipped image]');
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/ {2,}/g, ' ');
    text = unescapeHTML(text);

    text = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n');

    return text;
}

function createModal(title) {
    if (!document.getElementById('novel-dl-styles')) {
        const style = document.createElement('style');
        style.id = 'novel-dl-styles';
        style.textContent = `
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }

    const modal = document.createElement('div');
    modal.id = 'downloadProgressModal';
    Object.assign(modal.style, {
        display: 'flex', zIndex: '9999', position: 'fixed', left: '0', top: '0',
        width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    });

    const modalContent = document.createElement('div');
    Object.assign(modalContent.style, {
        backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        width: '450px', maxWidth: '90%', padding: '0', overflow: 'hidden', animation: 'fadeIn 0.3s'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
        backgroundColor: '#f9f9fb', borderBottom: '1px solid #eaecef',
        padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    });
    
    const headerTitle = document.createElement('h3');
    headerTitle.textContent = title;
    Object.assign(headerTitle.style, { margin: '0', color: '#172238', fontSize: '16px', fontWeight: '600' });
    header.appendChild(headerTitle);
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    Object.assign(closeButton.style, {
        background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#666', padding: '0 4px', lineHeight: '1'
    });
    // [Modified to English]
    closeButton.onclick = () => { if (confirm('Do you want to cancel the download?')) { document.body.removeChild(modal); } };
    header.appendChild(closeButton);
    modalContent.appendChild(header);

    const body = document.createElement('div');
    Object.assign(body.style, { padding: '20px' });
    modalContent.appendChild(body);

    const statusElement = document.createElement('div');
    Object.assign(statusElement.style, { marginBottom: '16px', fontSize: '14px', color: '#444', fontWeight: '500' });
    body.appendChild(statusElement);

    const progressInfo = document.createElement('div');
    Object.assign(progressInfo.style, { display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', color: '#555' });
    
    const progressText = document.createElement('div');
    progressText.textContent = '0%';
    Object.assign(progressText.style, { fontWeight: '600' });
    progressInfo.appendChild(progressText);
    
    const timeRemaining = document.createElement('div');
    progressInfo.appendChild(timeRemaining);
    body.appendChild(progressInfo);

    const progressBarContainer = document.createElement('div');
    Object.assign(progressBarContainer.style, { width: '100%', height: '8px', backgroundColor: '#eaecef', borderRadius: '8px', overflow: 'hidden' });
    
    const progressBar = document.createElement('div');
    Object.assign(progressBar.style, {
        width: '0%', height: '100%', background: 'linear-gradient(90deg, #3a7bd5, #6fa1ff)', borderRadius: '8px', transition: 'width 0.3s ease'
    });
    progressBarContainer.appendChild(progressBar);
    body.appendChild(progressBarContainer);

    const detailedProgress = document.createElement('div');
    Object.assign(detailedProgress.style, { marginTop: '16px', fontSize: '13px', color: '#666', textAlign: 'center' });
    body.appendChild(detailedProgress);

    modal.appendChild(modalContent);
    return { modal, statusElement, progressText, timeRemaining, progressBar, detailedProgress };
}

function createProgressTracker(totalItems) {
    const startTime = Date.now();
    const processingTimes = [];
    const MAX_SAMPLES = 5;
    
    return {
        update: (completedItems) => {
            const progress = (completedItems / totalItems) * 100;
            const elapsed = Date.now() - startTime;
            
            if (completedItems > 0) {
                const currentTimePerItem = elapsed / completedItems;
                processingTimes.push(currentTimePerItem);
                if (processingTimes.length > MAX_SAMPLES) processingTimes.shift();
            }
            
            const avgTimePerItem = processingTimes.length > 0 
                ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
                : 0;
            
            const remainingItems = totalItems - completedItems;
            const estimatedRemainingTime = avgTimePerItem * remainingItems;
            
            return {
                progress: progress.toFixed(1),
                remaining: formatTime(estimatedRemainingTime),
                elapsed: formatTime(elapsed),
                speed: (avgTimePerItem > 0) ? (1000 / avgTimePerItem).toFixed(2) : "0.00"
            };
        }
    };
}

// [Modified to English]
function formatTime(ms) {
    if (ms < 1000) return "Please wait...";
    if (ms < 60000) return `${Math.ceil(ms / 1000)}s`;
    if (ms < 3600000) {
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    }
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

async function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url; script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
    });
}

function sanitizeFilename(name) {
    return name.replace(/[/\\?%*:|"<>]/g, '_');
}

async function downloadNovel(title, episodeLinks, startEpisode, endEpisode, delayMs = 5000) {
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
        position: 'fixed', zIndex: '9999', left: '0', top: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    });

    const dialogContent = document.createElement('div');
    Object.assign(dialogContent.style, {
        backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        width: '350px', maxWidth: '90%', padding: '24px', animation: 'fadeIn 0.3s'
    });

    // [Modified to English]
    const dialogTitle = document.createElement('h3');
    dialogTitle.textContent = 'Select Save Mode';
    Object.assign(dialogTitle.style, { margin: '0 0 20px 0', color: '#172238', fontSize: '18px', fontWeight: '600' });
    dialogContent.appendChild(dialogTitle);

    const optionsContainer = document.createElement('div');
    Object.assign(optionsContainer.style, { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' });

    const createOption = (value, text, description) => {
        const option = document.createElement('div');
        Object.assign(option.style, {
            padding: '14px', border: '1px solid #e4e9f0', borderRadius: '8px',
            cursor: 'pointer', backgroundColor: '#f9f9fb', transition: 'all 0.2s ease'
        });
        option.innerHTML = `
            <div style="font-weight: 600; color: #172238; margin-bottom: 4px;">${text}</div>
            <div style="font-size: 13px; color: #666;">${description}</div>
        `;
        option.onclick = () => {
            document.body.removeChild(dialog);
            processDownload(value === '1' ? false : true);
        };
        option.onmouseover = () => { option.style.backgroundColor = '#f0f2f8'; option.style.borderColor = '#3a7bd5'; };
        option.onmouseout = () => { option.style.backgroundColor = '#f9f9fb'; option.style.borderColor = '#e4e9f0'; };
        return option;
    };

    // [Modified to English]
    optionsContainer.appendChild(createOption('1', 'Merge into a single file', 'All episodes will be saved in a single text file.'));
    optionsContainer.appendChild(createOption('2', 'Save per episode (ZIP)', 'Each episode will be saved as an individual text file inside a ZIP archive.'));
    dialogContent.appendChild(optionsContainer);
    
    // [Modified to English]
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    Object.assign(cancelButton.style, {
        width: '100%', padding: '10px', border: '1px solid #e4e9f0', borderRadius: '8px',
        backgroundColor: '#f9f9fb', cursor: 'pointer', fontSize: '14px', fontWeight: '500'
    });
    cancelButton.onclick = () => document.body.removeChild(dialog);
    dialogContent.appendChild(cancelButton);
    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    async function processDownload(saveAsZip) {
        let zip;
        if (saveAsZip) {
            try {
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
                zip = new JSZip();
            } catch (e) {
                alert('Failed to load ZIP library!');
                return;
            }
        }

        const startingIndex = startEpisode - 1;
        const endingIndex = endEpisode - 1;
        const totalEpisodes = endingIndex - startingIndex + 1;

        // [Modified to English]
        const { modal, statusElement, progressText, timeRemaining, progressBar, detailedProgress } = createModal(`"${title}" Downloading`);
        document.body.appendChild(modal);
        
        const progressTracker = createProgressTracker(totalEpisodes);
        let novelText = `${title}\n\nDownloaded with novel-dl\n\n`;
        let completedEpisodes = 0;
        let failedEpisodes = 0;
        let captchaCount = 0;

        // [Modified to English]
        statusElement.textContent = 'Preparing download...';
        
        for (let i = startingIndex; i <= endingIndex; i++) {
            let episodeUrl = episodeLinks[i];
            if (!episodeUrl) continue;
            
            if (episodeUrl.startsWith('/')) {
                episodeUrl = window.location.origin + episodeUrl;
            }

            const currentEpisode = i - startingIndex + 1;
            // [Modified to English]
            statusElement.textContent = `Downloading... (${currentEpisode}/${totalEpisodes})`;

            let result = await fetchNovelContent(episodeUrl);
            if (!result) {
                captchaCount++;
                // [Modified to English]
                const userConfirmed = confirm(`CAPTCHA detected! \n${episodeUrl}\nPlease solve it and click OK.`);
                if (!userConfirmed) { failedEpisodes++; continue; }
                result = await fetchNovelContent(episodeUrl);
                if (!result) { failedEpisodes++; continue; }
            }

            const { episodeTitle, content} = result;
            if (saveAsZip) {
                zip.file(`${sanitizeFilename(episodeTitle)}.txt`, content);
            } else {
                novelText += `${episodeTitle}\n\n${content}\n\n`;
            }

            completedEpisodes++;
            const stats = progressTracker.update(completedEpisodes);
            
            progressBar.style.width = `${stats.progress}%`;
            progressText.textContent = `${stats.progress}%`;
            // [Modified to English]
            timeRemaining.textContent = `Time remaining: ${stats.remaining}`;
            detailedProgress.innerHTML = `
                <div style="margin-bottom: 4px; display: flex; justify-content: center; gap: 12px;">
                    <span>✅ OK: ${completedEpisodes}</span>
                    <span>❌ Fail: ${failedEpisodes}</span>
                </div>
                <div>Elapsed: ${stats.elapsed} | Speed: ${stats.speed} ep/s</div>
            `;
            await new Promise(r => setTimeout(r, delayMs));
        }

        // [Modified to English]
        statusElement.textContent = '✅ Completed!';
        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        
        setTimeout(() => {
            document.body.removeChild(modal);
            if (saveAsZip) {
                zip.generateAsync({type: 'blob'}).then(blob => {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `${sanitizeFilename(title)}.zip`;
                    a.click();
                });
            } else {
                const blob = new Blob([novelText], {type: 'text/plain'});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${sanitizeFilename(title)}(${startEpisode}-${endEpisode}).txt`;
                a.click();
            }
        }, 500);
    }
}

function extractTitle() {
    const titleElement = document.querySelector('.novel-detail h1');
    if (titleElement) {
        return titleElement.textContent.replace(/[&"']/g, '').trim();
    }
    if (document.title) {
        return document.title.split('-')[0].replace(/[&"']/g, '').trim();
    }
    return null;
}

function extractEpisodeLinks() {
    const links = document.querySelectorAll('.novel-eps li a');
    const episodeLinks = Array.from(links).map(link => link.getAttribute('href')).filter(Boolean);
    return episodeLinks.reverse();
}

async function fetchPage(url) {
    const response = await fetch(url);
    if (!response.ok) return null;
    const html = await response.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
}

async function runCrawler() {
    if (!window.location.pathname.includes('/novel/')) {
        // [Modified to English]
        alert('This script must be executed on the novel listing page.');
        return;
    }

    const title = extractTitle();
    if (!title) {
        // [Modified to English]
        alert('Failed to extract the novel title.');
        return;
    }

    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
        position: 'fixed', zIndex: '9999', left: '0', top: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    });

    const dialogContent = document.createElement('div');
    Object.assign(dialogContent.style, {
        backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        width: '400px', maxWidth: '90%', padding: '24px', animation: 'fadeIn 0.3s'
    });

    // [Modified to English]
    const dialogTitle = document.createElement('h3');
    dialogTitle.textContent = `"${title}" Settings`;
    Object.assign(dialogTitle.style, { margin: '0 0 20px 0', color: '#172238', fontSize: '18px', fontWeight: '600' });
    dialogContent.appendChild(dialogTitle);

    function createInputGroup(labelText, inputType, defaultValue, placeholder, description) {
        const group = document.createElement('div');
        group.style.marginBottom = '20px';
        
        const label = document.createElement('label');
        label.textContent = labelText;
        Object.assign(label.style, { display: 'block', marginBottom: '8px', fontSize: '14px', color: '#444', fontWeight: '500' });
        group.appendChild(label);
        
        if (description) {
            const desc = document.createElement('div');
            desc.textContent = description;
            Object.assign(desc.style, { fontSize: '13px', color: '#666', marginBottom: '8px' });
            group.appendChild(desc);
        }
        
        const input = document.createElement('input');
        input.type = inputType; input.value = defaultValue; input.placeholder = placeholder || '';
        Object.assign(input.style, { width: '100%', padding: '10px', border: '1px solid #e4e9f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' });
        group.appendChild(input);
        
        return { group, input };
    }

    // [Modified to English]
    const pagesInput = createInputGroup('Number of List Pages', 'number', '1', '', 'If all episodes are loaded on one page, keep it as 1.');
    dialogContent.appendChild(pagesInput.group);

    const buttonsContainer = document.createElement('div');
    Object.assign(buttonsContainer.style, { display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '12px' });

    // [Modified to English]
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    Object.assign(cancelButton.style, {
        flex: '1', padding: '10px', border: '1px solid #e4e9f0', borderRadius: '8px', backgroundColor: '#f9f9fb', cursor: 'pointer'
    });
    cancelButton.onclick = () => document.body.removeChild(dialog);
    buttonsContainer.appendChild(cancelButton);

    // [Modified to English]
    const continueButton = document.createElement('button');
    continueButton.textContent = 'Continue';
    Object.assign(continueButton.style, {
        flex: '1', padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: '#3a7bd5', color: 'white', cursor: 'pointer'
    });
    buttonsContainer.appendChild(continueButton);
    dialogContent.appendChild(buttonsContainer);
    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    continueButton.onclick = async () => {
        document.body.removeChild(dialog);

        const loadingDialog = document.createElement('div');
        Object.assign(loadingDialog.style, {
            position: 'fixed', zIndex: '9999', left: '0', top: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        });
        const loadingContent = document.createElement('div');
        Object.assign(loadingContent.style, { backgroundColor: '#fff', borderRadius: '12px', width: '300px', padding: '24px', textAlign: 'center' });
        // [Modified to English]
        const loadingText = document.createElement('p');
        loadingText.textContent = 'Loading episode list...';
        loadingContent.appendChild(loadingText);
        loadingDialog.appendChild(loadingContent);
        document.body.appendChild(loadingDialog);

        const allEpisodeLinks = extractEpisodeLinks();
        document.body.removeChild(loadingDialog);

        if (allEpisodeLinks.length === 0) {
            // [Modified to English]
            alert('Failed to fetch the episode list. Please check the page structure.');
            return;
        }

        const rangeDialog = document.createElement('div');
        Object.assign(rangeDialog.style, {
            position: 'fixed', zIndex: '9999', left: '0', top: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        });

        const rangeContent = document.createElement('div');
        Object.assign(rangeContent.style, { backgroundColor: '#fff', borderRadius: '12px', width: '400px', padding: '24px' });

        // [Modified to English]
        const rangeTitle = document.createElement('h3');
        rangeTitle.textContent = 'Configure Download Range';
        rangeContent.appendChild(rangeTitle);

        const episodeCount = document.createElement('div');
        episodeCount.innerHTML = `<span style="background-color: #ebf5ff; color: #3a7bd5; padding: 4px 8px; border-radius: 4px;">Total ${allEpisodeLinks.length} Episodes</span>`;
        rangeContent.appendChild(episodeCount);

        // [Modified to English]
        const startInput = createInputGroup('Start Episode', 'number', '1', '');
        rangeContent.appendChild(startInput.group);

        const endInput = createInputGroup('End Episode', 'number', allEpisodeLinks.length.toString(), '');
        rangeContent.appendChild(endInput.group);
        
        const delayInput = createInputGroup('Delay (ms)', 'number', '5000', '', '⚠️ Recommended: Keep 5000ms (5s) to avoid blocks.');
        rangeContent.appendChild(delayInput.group);

        const rangeButtons = document.createElement('div');
        Object.assign(rangeButtons.style, { display: 'flex', justifyContent: 'space-between', marginTop: '20px', gap: '12px' });

        // [Modified to English]
        const rangeCancelButton = document.createElement('button');
        rangeCancelButton.textContent = 'Cancel';
        rangeCancelButton.onclick = () => document.body.removeChild(rangeDialog);
        rangeButtons.appendChild(rangeCancelButton);

        // [Modified to English]
        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download';
        rangeButtons.appendChild(downloadButton);
        rangeContent.appendChild(rangeButtons);
        rangeDialog.appendChild(rangeContent);
        document.body.appendChild(rangeDialog);

        downloadButton.onclick = () => {
            const startEpisode = parseInt(startInput.input.value, 10);
            const endEpisode = parseInt(endInput.input.value, 10);
            const delay = parseInt(delayInput.input.value, 10);

            if (isNaN(startEpisode) || isNaN(endEpisode) || startEpisode < 1 || endEpisode < startEpisode || endEpisode > allEpisodeLinks.length) {
                // [Modified to English]
                alert('Please enter a valid episode range.');
                return;
            }

            document.body.removeChild(rangeDialog);
            downloadNovel(title, allEpisodeLinks, startEpisode, endEpisode, delay);
        };
    };
}

runCrawler();
