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
                
                // [정밀 조준] 섀도 돔 장벽이 쳐진 소설 뷰어의 핵심 뼈대 div 컨테이너 추적
                const shadowHost = popupDoc.querySelector('.novel-viewer div[style*="font-size"]');
                
                // Next.js 스트리밍 데이터 조립이 끝나고 뷰어 레이아웃이 화면에 안착했는지 검증
                if (shadowHost && !popupDoc.body.innerText.includes("불러오는 중")) {
                    
                    // [보안 돌파 핵심] closed 상태의 섀도 루트는 일반 돔 명령어로 안 잡히므로 
                    // HTML 원본 문자열 스트림에 주입된 template 노드의 실시간 가상 트리 구조를 직접 파싱합니다.
                    const templateElem = shadowHost.querySelector('template');
                    let pureBodyText = '';

                    if (templateElem && templateElem.content) {
                        // 템플릿 콘텐츠 내부의 모든 순수 소설 패러그래프(<p>) 문장들만 가체 추출
                        const paragraphs = Array.from(templateElem.content.querySelectorAll('p'));
                        pureBodyText = paragraphs.map(p => p.textContent.trim()).filter(Boolean).join('\n\n');
                    } else {
                        // 만약 브라우저가 하이드레이션을 끝내고 template을 소멸시켰다면 가상 돔 스트림 문자열에서 다이렉트 추출
                        const innerHTML = shadowHost.innerHTML;
                        const match = innerHTML.match(/<template[^>]*>([\s\S]*?)<\/template>/);
                        if (match && match[1]) {
                            const virtualDoc = new DOMParser().parseFromString(match[1], 'text/html');
                            const paragraphs = Array.from(virtualDoc.querySelectorAll('p'));
                            pureBodyText = paragraphs.map(p => p.textContent.trim()).filter(Boolean).join('\n\n');
                        }
                    }

                    // 진짜 알맹이 본문 텍스트가 정상 수집되었을 때 최종 가공 및 세션 종료
                    if (pureBodyText && pureBodyText.length > 50) {
                        clearInterval(timer);
                        
                        // 에피소드 제목 추출
                        let episodeTitle = 'Untitled Episode';
                        const numElem = popupDoc.querySelector('.ne-h1, .ne-num, h1');
                        if (numElem) {
                            episodeTitle = numElem.textContent.trim();
                        }

                        popup.close();

                        // 불필요한 상하단 메뉴 수동 삭제 로직을 거칠 필요 없이 100% 순수 소설 문장만 정제 반환
                        pureBodyText = cleanText(pureBodyText);
                        
                        resolve({
                            episodeTitle: episodeTitle,
                            content: pureBodyText
                        });
                    }
                }
            } catch (e) {
                // 페이지 크로스 도메인 로딩 순간의 브라우저 컨텍스트 예외 무시
            }

            if (checkAttempts >= maxAttempts) {
                clearInterval(timer);
                console.error(`Timeout waiting for closed shadow DOM parsing on: ${url}`);
                try { popup.close(); } catch(_) {}
                resolve(null);
            }
        }, 200); // 0.2초 간격 감시폴링
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
