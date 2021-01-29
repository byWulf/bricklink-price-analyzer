// ==UserScript==
// @name         BrickLink Price calculator
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.bricklink.com/v2/wanted/search.page?*wantedMoreID=*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Display price per piece, for when 100g should cost 3/5/10€
    let pricesPer100G = [3, 5, 10];

    // Output these specific shops and their prices
    let highlightShopNames = ['Figsbricks - NO FEES', 'Magic Magnus 🛒', 'Bricksel', 'Mamas-Brixx'];

    // Styling
    let style = 'border: 1px solid #ddd; background-color: #efe; padding: 3px; border-radius: 2px;';

    let $ = window.$;

    // -----------------
    // --- Functions ---
    // -----------------
    const recalculatePricePositions = (slider) => {
        let maxPrice = 0;
        slider.find('.price').each((i, elem) => {
            maxPrice = Math.max(maxPrice, parseFloat($(elem).attr('data-price')));
        });

        slider.find('.price').each((i, elem) => {
            let price = parseFloat($(elem).attr('data-price'));

            $(elem).css('left', 'calc(' + (price / maxPrice) + ' * (100% - 50px) + 25px)');
        });
    };

    const addPrice = (slider, price, color, text, position, zIndex) => {
        const priceElem = $('<div class="price" data-price="' + price + '" style="position: absolute; left: calc(' + (price / 1) + ' * (100% - 50px) + 25px); top: 30px; z-index: ' + zIndex + ';"></div>');
        const lineElem = $('<div class="line" style="position: absolute; left: 0; top: ' + (position === 'top' ? '-10px' : '0px') + '; width: 1px; height: 11px; background-color: ' + color + ';"></div>');
        const textElem = $('<div class="text" style="position: absolute; left: -25px; top: ' + (position === 'top' ? '-30px' : '10px') + '; width: 50px; height: 20px; overflow: hidden; text-align: center; color: ' + color + ';">' + text + '</div>');
        lineElem.appendTo(priceElem);
        textElem.appendTo(priceElem);
        priceElem.appendTo(slider);

        recalculatePricePositions(slider);
    };

    // TODO: Doesn't work yet due to react?
    $('body').on('click', 'button.fill-prices', (e) => {
        let elem = $(e.currentTarget);

        console.log(elem.parent().find('.wl-col-price input'));

        let tenPrice = parseFloat(elem.parent().find('.pricePer100[data-euro="10"]').attr('data-price'));
        let shopPrice = parseFloat(elem.parent().find('.lastPlace').attr('data-price'));

        elem.parent().parent().find('.wl-col-price input').val(Math.min(tenPrice, shopPrice)).trigger('change');
        elem.parent().parent().find('.wl-col-remarks textarea').val(elem.parent().find('.stats').text()).trigger('change');
    });

    let button = $('<button class="bl-btn primaryYellow" type="button">Prizify</button>');
    $('.wl-table-heading:first > span:last').prepend(button);

    button.on('click', () => {
        let ajaxStack = [];
        $('.stats, .fill-prices, .item-weight-info, .gram-display').remove();

        $('div:not(.table-header) > .wl-col-desc').each((i, elem) => {
            const container = $('<div class="stats" style="margin-top: 5px;' + style + '">Loading...</div>');
            const slider = $('<div class="slider" style="margin-top: 5px;background-color: #efe;padding: 5px;border-radius: 2px;margin-top: -5px;margin-bottom: 5px;height: 60px; position: relative;"></div>');
            slider.append('<div class="line" style="height: 1px;background-color: #aaa;width: calc(100% - 50px); position: absolute; left: 25px; top: 30px;"></div>');

            $(elem).append(container);
            $(elem).append('<button type="button" class="fill-prices">Übernehmen</button>');
            $(elem).closest('.table-row').parent().append(slider);

            addPrice(slider, 0, '#ccc', '', 'top', 0);

            ajaxStack.push({url: $(elem).find('a').attr('href'), container: container, slider: slider});
        });

        function handleStack() {
            let entry = ajaxStack.splice(0, 1)[0];

            if (!entry) {
                return;
            }

            setTimeout(() => {
                $.get(entry.url, (text) => {

                    const weight = text.match(/\<span id="item-weight-info">([0-9.]+)g\<\/span>/)[1];
                    if (!weight) {
                        entry.container.text('Failed!');
                        handleStack();
                        return;
                    }

                    entry.container.parent().find('.icon-color').parent().append('<span class="gram-display" style="margin-left: 5px; ' + style + '">' + weight + 'g</span>');


                    let texts = [];
                    let piecesPer100G = 100 / parseFloat(weight);
                    for (let i = 0; i < pricesPer100G.length; i++) {
                        let pricePerPiece = pricesPer100G[i] / piecesPer100G;
                        texts.push('<div class="pricePer100" data-euro="' + pricesPer100G[i] + '" data-price="' + (Math.round(pricePerPiece * 10000) / 10000) + '">' + pricesPer100G[i] + '€/100g = ' + (Math.round(pricePerPiece * 10000) / 10000) + '€</div>');
                    }

                    for (let i = 1; i <= 10; i++) {
                        let pricePerPiece = i / piecesPer100G;
                        addPrice(entry.slider, pricePerPiece, '#da0', i, 'top', 0);
                    }

                    entry.container.html(texts.join('\n'));

                    let color = entry.url.match(/C=([^&]+)/)[1];
                    let itemId = text.match(/idItem:.*?(\d+)/)[1];
                    if (!color || !itemId) {
                        handleStack();
                        return;
                    }

                    setTimeout(() => {
                        $.get('https://www.bricklink.com/ajax/clone/catalogifs.ajax?itemid=' + itemId + '&color=' + color + '&rpp=500&loc=DE&iconly=0', (json) => {
                            let cheapestPrice = null;
                            for (let i = 0; i < json.list.length; i++) {

                                let price = json.list[i].mInvSalePrice;
                                if (price.indexOf('EUR') !== 0) {
                                    price = json.list[i].mDisplaySalePrice;
                                }

                                let priceFloat = price.match(/EUR (.*)/)[1];
                                if (cheapestPrice === null) {
                                    cheapestPrice = priceFloat;
                                }

                                if (priceFloat > cheapestPrice * 10) {
                                    break;
                                }

                                console.log(json.list[i]);

                                if (highlightShopNames.indexOf(json.list[i].strStorename) !== -1) {
                                    addPrice(entry.slider, priceFloat, '#f00', json.list[i].strStorename, 'bottom', 10);
                                } else if (i === 0 || i === json.list.length - 1) {
                                    addPrice(entry.slider, priceFloat, '#0c0', '', 'bottom', 0);
                                }

                                if (i === 24) {
                                    addPrice(entry.slider, priceFloat, '#0ff', '', 'top', 10);
                                }
                            }

                            let firstPrice = json.list.splice(0, 1)[0].mInvSalePrice;
                            let lastPriceElem = json.list.length < 24 ? json.list.pop() : json.list.splice(24, 1)[0];
                            let lastPrice = lastPriceElem.mInvSalePrice;
                            if (lastPrice.indexOf('EUR') !== 0) {
                                lastPrice = lastPriceElem.mDisplaySalePrice;
                            }

                            entry.container.append('<div>1. Platz online: ' + firstPrice + '</div>');
                            entry.container.append('<div class="lastPlace" data-price="' + (lastPrice.match(/EUR (.*)/)[1] || 0) + '">' + (json.list.length < 23 ? json.list.length + 2 : 25) + '. Platz online: ' + lastPrice + '</div>');

                            handleStack();

                        }, 'json')
                    }, 1000);

                })
            }, 1000);
        }
        handleStack();
    });
})();
