// =======================================================================
// [보안 우회 핵심] 브라우저 Declarative Shadow DOM 강제 잠금해제 엔진
// 사이트가 closed형 섀도 돔을 선언하더라도 open형으로 전환하여 파싱되도록 우회합니다.
// =======================================================================
if (!Element.prototype._attachShadow) {
    Element.prototype._attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
        if (options && options.mode === 'closed') {
            options.mode = 'open'; // closed -> open 강제 변경
        }
        return this._attachShadow(options);
    };
}

// 기존에 생성되어 화면에 남아있던 쓰레기 다이얼로그 및 모달창을 완전 폭파 및 청소
// (오타 버전의 옛날 버튼들이 계속 눌리는 고스트 버그 현상을 방지합니다)
const cleanupOldGarbage = () => {
    const oldDialogs = document.querySelectorAll('div[style*="rgba(0,0,0,0.5)"], #downloadProgressModal, #downloadProgressModal ~ div');
    oldDialogs.forEach(el => {
        try { el.remove(); } catch(e) {}
    });
};
cleanupOldGarbage();

async function fetchNovelContent(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch content from ${url}. Status: ${response.status}`);
            return null;
        }

        let html = await response.text();
        
        // [우회 가이드 핵심] closed 장벽 문자열을 open으로 전면 강제 치환!
        html = html.replace(/shadowrootmode=["']closed["']/gi, 'shadowrootmode="open"');

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 에피소드 제목 추출
        let episodeTitle = 'Untitled Episode';
        const numElem = doc.querySelector('.ne-num, .ne-title, h1, .ne-h1');
        if (numElem) {
            episodeTitle = numElem.textContent.trim();
        }

        // 잠금이 강제로 해제된 섀도 돔 호스트 엘리먼트 조준
        const shadowHost = doc.querySelector('.novel-viewer div[style*="font-size"]');
        let cleanedContent = '';

        if (shadowHost && shadowHost.shadowRoot) {
            // 이제 open 상태가 되었으므로 shadowRoot 내부의 순수 소설 단락(<p>)들만 정밀 가공 수집 가능!
            const paragraphs = Array.from(shadowHost.shadowRoot.querySelectorAll('p'));
            cleanedContent = paragraphs.map(p => p.textContent.trim()).filter(Boolean).join('\n\n');
        } else {
            // Fallback: 혹시라도 섀도 돔 조립 전에 템플릿 태그가 남아있다면 직접 탐색 수집
            const templateElem = doc.querySelector('.novel-viewer template');
            if (templateElem && templateElem.content) {
                const paragraphs = Array.from(templateElem.content.querySelectorAll('p'));
                cleanedContent = paragraphs.map(p => p.textContent.trim()).filter(Boolean).join('\n\n');
            }
        }

        // 유효 텍스트 길이 검증 방어코드
        if (!cleanedContent || cleanedContent.length < 50) {
            console.error(`Bypass parsed content is empty or too short on: ${url}`);
            return null;
        }

        cleanedContent = cleanText(cleanedContent);
        if (cleanedContent.startsWith(episodeTitle)) {
            cleanedContent = cleanedContent.slice(episodeTitle.length).trim();
        }

        return {
            episodeTitle: episodeTitle,
            content: cleanedContent
        };
    } catch (e) {
        console.error(`Error fetching novel content for ${url}:`, e);
        return null;
    }
}

function unescapeHTML(text) {
    const entities = {
        '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'",
        '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '--', '&lsquo;': "'",
        '&raquo;': "'", '&ldquo;': '"', '&rdquo;': '"'
    };
    Object.entries(entities).forEach(([entity, replacement]) => {
        text = text.replace(new RegExp(entity, 'g'), replacement);
    });
    return text;
}

function cleanText(text) {
    text = unescapeHTML(text);
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n');
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

    optionsContainer.appendChild(createOption('1', 'Merge into a single file', 'All episodes will be saved in a single text file.'));
    optionsContainer.appendChild(createOption('2', 'Save per episode (ZIP)', 'Each episode will be saved as an individual text file inside a ZIP archive.'));
    dialogContent.appendChild(optionsContainer);
    
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

        const { modal, statusElement, progressText, timeRemaining, progressBar, detailedProgress } = createModal(`"${title}" Downloading`);
        document.body.appendChild(modal);
        
        const progressTracker = createProgressTracker(totalEpisodes);
        let novelText = `${title}\n\nDownloaded with novel-dl\n\n`;
        let completedEpisodes = 0;
        let failedEpisodes = 0;
        let captchaCount = 0;

        statusElement.textContent = 'Preparing download...';
        
        for (let i = startingIndex; i <= endingIndex; i++) {
            let episodeUrl = episodeLinks[i];
            if (!episodeUrl) continue;
            
            if (episodeUrl.startsWith('/')) {
                episodeUrl = window.location.origin + episodeUrl;
            }

            const currentEpisode = i - startingIndex + 1;
            statusElement.textContent = `Downloading... (${currentEpisode}/${totalEpisodes})`;

            let result = await fetchNovelContent(episodeUrl);
            if (!result) {
                captchaCount++;
                const userConfirmed = confirm(`Bypass alert trigger! \n${episodeUrl}\nPlease make sure network is stable and click OK to retry.`);
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
    if (titleElement) return titleElement.textContent.replace(/[&"']/g, '').trim();
    return document.title ? document.title.split('-')[0].replace(/[&"']/g, '').trim() : null;
}

function extractEpisodeLinks() {
    const links = document.querySelectorAll('.novel-eps li a');
    return Array.from(links).map(link => link.getAttribute('href')).filter(Boolean).reverse();
}

async function runCrawler() {
    if (!window.location.pathname.includes('/novel/')) {
        alert('This script must be executed on the novel listing page.');
        return;
    }

    const title = extractTitle();
    if (!title) {
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

    const pagesInput = createInputGroup('Number of List Pages', 'number', '1', '', 'If all episodes are loaded on one page, keep it as 1.');
    dialogContent.appendChild(pagesInput.group);

    const buttonsContainer = document.createElement('div');
    Object.assign(buttonsContainer.style, { display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '12px' });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    Object.assign(cancelButton.style, {
        flex: '1', padding: '10px', border: '1px solid #e4e9f0', borderRadius: '8px', backgroundColor: '#f9f9fb', cursor: 'pointer'
    });
    cancelButton.onclick = () => document.body.removeChild(dialog);
    buttonsContainer.appendChild(cancelButton);

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
        const loadingText = document.createElement('p');
        loadingText.textContent = 'Loading episode list...';
        loadingContent.appendChild(loadingText);
        loadingDialog.appendChild(loadingContent);
        document.body.appendChild(loadingDialog);

        const allEpisodeLinks = extractEpisodeLinks();
        document.body.removeChild(loadingDialog);

        if (allEpisodeLinks.length === 0) {
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

        const rangeTitle = document.createElement('h3');
        rangeTitle.textContent = 'Configure Download Range';
        rangeContent.appendChild(rangeTitle);

        const episodeCount = document.createElement('div');
        episodeCount.innerHTML = `<span style="background-color: #ebf5ff; color: #3a7bd5; padding: 4px 8px; border-radius: 4px;">Total ${allEpisodeLinks.length} Episodes</span>`;
        rangeContent.appendChild(episodeCount);

        const startInput = createInputGroup('Start Episode', 'number', '1', '');
        rangeContent.appendChild(startInput.group);

        const endInput = createInputGroup('End Episode', 'number', allEpisodeLinks.length.toString(), '');
        rangeContent.appendChild(endInput.group);
        
        const delayInput = createInputGroup('Delay (ms)', 'number', '5000', '', '⚠️ Recommended: Keep 5000ms (5s) to avoid blocks.');
        rangeContent.appendChild(delayInput.group);

        const rangeButtons = document.createElement('div');
        Object.assign(rangeButtons.style, { display: 'flex', justifyContent: 'space-between', marginTop: '20px', gap: '12px' });

        const rangeCancelButton = document.createElement('button');
        rangeCancelButton.textContent = 'Cancel';
        rangeCancelButton.onclick = () => document.body.removeChild(rangeDialog);
        rangeButtons.appendChild(rangeCancelButton);

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

            // [오타 수정 완료] isNaN으로 철저히 보정하여 ReferenceError를 원천 차단했습니다.
            if (isNaN(startEpisode) || isNaN(endEpisode) || startEpisode < 1 || endEpisode < startEpisode || endEpisode > allEpisodeLinks.length) {
                alert('Please enter a valid episode range.');
                return;
            }

            document.body.removeChild(rangeDialog);
            downloadNovel(title, allEpisodeLinks, startEpisode, endEpisode, delay);
        };
    };
}

runCrawler();
