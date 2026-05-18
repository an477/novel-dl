async function fetchNovelContent(url) {
    return new Promise((resolve) => {
        // 1. 보안 인증 우회를 위해 실제 팝업 창 오픈
        const popup = window.open(url, '_blank', 'width=800,height=600,noopener=false,noreferrer=false');
        
        if (!popup) {
            alert("Popup blocker is active! Please allow popups for this site to download.");
            resolve(null);
            return;
        }

        let checkAttempts = 0;
        const maxAttempts = 50; // 최대 10초 대기
        
        const timer = setInterval(() => {
            checkAttempts++;
            try {
                const popupDoc = popup.document;
                const popupWin = popup.window;
                
                // 섀도 돔 호스트 엘리먼트가 완전히 브라우저에 안착했는지 검증
                const shadowHost = popupDoc.querySelector('.novel-viewer div[style*="font-size"]');
                
                if (shadowHost && !popupDoc.body.innerText.includes("불러오는 중")) {
                    clearInterval(timer);
                    
                    // 에피소드 제목 추출
                    let episodeTitle = 'Untitled Episode';
                    const numElem = popupDoc.querySelector('.ne-h1, .ne-num, h1');
                    if (numElem) {
                        episodeTitle = numElem.textContent.trim();
                    }

                    // 2. [보안 돌파 최후의 카드] 팝업창 콘텍스트 내부에 가상 textarea를 심어 복사 강제 수행
                    // closed 섀도 돔 내부의 원래 마크업 데이터 소스를 문자열로 가로챕니다.
                    const templateHtml = shadowHost.querySelector('template') ? shadowHost.querySelector('template').innerHTML : '';
                    let targetRawText = '';

                    if (templateHtml) {
                        // 템플릿 내부에 숨겨진 <p> 태그 텍스트 스트림을 가상 DOM으로 안전하게 렌더링 가공
                        const vDoc = new DOMParser().parseFromString(templateHtml, 'text/html');
                        targetRawText = Array.from(vDoc.querySelectorAll('p')).map(p => p.textContent.trim()).filter(Boolean).join('\n\n');
                    } else {
                        // 만약 템플릿이 소멸했다면 자식 창의 전체 HTML 스트링을 강제로 찢어서 <p> 태그 내부 텍스트만 전수 추출
                        const rawHtml = shadowHost.innerHTML;
                        const pMatches = rawHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/g);
                        if (pMatches) {
                            targetRawText = pMatches.map(p => p.replace(/<[^>]*>/g, '').trim()).filter(Boolean).join('\n\n');
                        }
                    }

                    // 3. 만약 위 정밀 우회 기믹들이 차단당했다면 유저가 요구한 Ctrl+A, Ctrl+C 메커니즘을 자식 창 안에서 완벽 재현
                    if (!targetRawText || targetRawText.length < 50) {
                        const tx = popupDoc.createElement('textarea');
                        tx.style.position = 'fixed';
                        tx.style.top = '0';
                        tx.style.left = '0';
                        tx.style.opacity = '0';
                        // 화면 뒤에 숨어있는 모든 스크립트 파편 스트림 백업본 로드
                        tx.value = popupDoc.body.innerHTML.replace(/<[^>]*>/g, '\n');
                        popupDoc.body.appendChild(tx);
                        tx.select();
                        targetRawText = tx.value;
                        popupDoc.body.removeChild(tx);
                    }

                    // 팝업 창 안전하게 클로즈
                    popup.close();

                    // 4. [요청하신 자르기 편집 편집기 작동]
                    let cleanedContent = targetRawText;

                    // 만약 찌꺼기 메뉴 텍스트가 섞여 들어왔다면 해당 라인들 제거 처리
                    if (cleanedContent.includes("16px") || cleanedContent.includes("기본")) {
                        const topMarkerRegex = /16\s*px[\s\+\-±\n]*기본/;
                        const topMatch = cleanedContent.match(topMarkerRegex);
                        if (topMatch) {
                            const upperSliced = cleanedContent.substring(topMatch.index + topMatch[0].length).trim();
                            let bottomIndex = upperSliced.lastIndexOf("‹ 이전화");
                            if (bottomIndex === -1 || bottomIndex < (upperSliced.length * 0.5)) {
                                bottomIndex = upperSliced.lastIndexOf("목록");
                            }
                            if (bottomIndex !== -1 && bottomIndex > 30) {
                                cleanedContent = upperSliced.substring(0, bottomIndex).trim();
                            } else {
                                cleanedContent = upperSliced;
                            }
                        }
                    }

                    // 처음 주셨던 줄바꿈 정돈 포맷 적용 후 최종 전송
                    cleanedContent = cleanText(cleanedContent);
                    if (cleanedContent.startsWith(episodeTitle)) {
                        cleanedContent = cleanedContent.slice(episodeTitle.length).trim();
                    }

                    resolve({
                        episodeTitle: episodeTitle,
                        content: cleanedContent
                    });
                }
            } catch (e) {
                // 크로스 도메인 초기 렌더링 찰나의 예외 무시
            }

            if (checkAttempts >= maxAttempts) {
                clearInterval(timer);
                console.error(`Timeout waiting for closed shadow DOM block bypass on: ${url}`);
                try { popup.close(); } catch(_) {}
                resolve(null);
            }
        }, 200);
    });
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

// ... 이하 createModal, downloadNovel, runCrawler 등 기존 UI 제어 코드 결합 구동
