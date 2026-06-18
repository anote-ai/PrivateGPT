import React, { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import fetcher from "../../http/RequestConfig";
import { createPortalSession } from "../../redux/UserSlice";
import { Button } from "flowbite-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";

const Pricing = (props) => {
  let dispatch = useDispatch();
  var showCurrentPlan =
    !(typeof props.currentPlanIndexOverride == "undefined") &&
    props.currentPlanIndexOverride != -1;
  const product3 = {
    id: 3,
    title: "Private GPT",
    url: "https://docs.anote.ai/privategpt/privategpt.html",
    forceContactUs: true,
    tiers: [
      {
        name: "Basic",
        price: "Free",
        month: false,
        features: [
          "Access to the standard GPT model without privacy-preserving features",
          "Supported Text File Formats: PDFs only",
          "Maximum Number of Files: Up to 5 files per session",
          "Total File Size Limit: Up to 10 MB per session",
          "Maximum Chats: 5 chats per month",
        ],
      },
      {
        name: "Standard",
        price: "$500",
        popular: true,
        month: true,
        features: [
          "Privacy-preserving LLM using a model like GPT-4ALL or LLAMA",
          "Limited file upload sizes",
          "Supported Text File Formats: PDFs and TXT files",
          "Maximum Number of Files: Up to 20 files per session",
          "Total File Size Limit: Up to 50 MB per session",
          "Maximum Chats: 20 chats per month",
        ],
      },
      {
        name: "Premium",
        price: "$1,000",
        month: true,
        features: [
          "Privacy-preserving LLM using a more powerful modern open local model",
          "Support for larger file upload sizes to handle more data",
          "Supported Text File Formats: All text file types (e.g., PDFs, TXT files, DOCX files, etc.)",
          "Maximum Number of Files: Up to 50 files per session",
          "Total File Size Limit: Up to 100 MB per session",
          "Maximum Chats: 50 chats per month",
        ],
      },
      {
        name: "Enterprise",
        month: false,
        price: "Contact us",
        features: [
          "Fully custom private LLM tailored to your specific use case and requirements",
          "Advanced features and dedicated support",
          "Supported Text File Formats: All text file types (e.g., PDFs, TXT files, DOCX files, etc.), and more based on your needs",
          "Maximum Number of Files: Customizable based on enterprise requirements",
          "Total File Size Limit: Customizable based on enterprise requirements",
          "Maximum Chats: Unlimited chats per month",
        ],
      },
    ],
  };

  const [product, setProduct] = useState(product3);
  const [selectedProductId, setSelectedProductId] = useState(
    props.productIndex ? props.productIndex : product3.id
  );

  useEffect(() => {
    switch (selectedProductId) {
      case product3.id:
        setProduct(product3);
        break;
      default:
        break;
    }
  }, [selectedProductId]);

  function buttonText(
    tier,
    product,
    isDefaultFreeTrial,
    currentPlanIndexOverride,
    showCurrentPlan,
    index
  ) {
    if (isDefaultFreeTrial) {
      return "Sign Up";
    }
    if (tier.price == "Contact us" || product.forceContactUs == true || !props.isCancelable) {
      return "Contact us";
    } else {
      if (!showCurrentPlan) {
        return "Sign Up";
      } else {
        if (currentPlanIndexOverride == index) {
          return "Cancel";
        } else {
            if (props.disableUpgrade) {
                return "Contact us";
            } else {
                if (currentPlanIndexOverride > index) {
                    return "Downgrade";
                } else {
                    return "Upgrade";
                }
            }
        }
      }
    }
  }

  function buttonAction(
    tier,
    product,
    isDefaultFreeTrial,
    currentPlanIndexOverride,
    showCurrentPlan,
    index
  ) {
    if (tier.price == "Contact us" || product.forceContactUs == true || (!props.isCancelable && !isDefaultFreeTrial) || (showCurrentPlan && currentPlanIndexOverride != index && props.disableUpgrade && (!isDefaultFreeTrial))) {
      var emailAddress = "nvidra@anote.ai";
      var subject = "Anote Sales: " + product.title;
      var body =
        "Hi, I am interested in Anote's " +
        product.title +
        " product and I am looking to get more information.";
      window.location.href =
        "mailto:" +
        emailAddress +
        "?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(body);
    } else {
      if (!showCurrentPlan || isDefaultFreeTrial) {
        window.location =
          product.signUpBaseUrl + "?product_hash=" + tier.productHash;
      } else {
        var newPaymentTier = null;
        if (currentPlanIndexOverride == index) {
          newPaymentTier = 0;
        } else {
          newPaymentTier = index + 1;
        }
        dispatch(createPortalSession({ paymentTier: newPaymentTier })).then(
          (resp) => {
            if (!("error" in resp)) {
              window.open(resp.payload, "_blank");
            }
          }
        );
      }
    }
  }

  return (
    <section className="text-anoteblack-100 body-font overflow-hidden">
      <div className="px-5 mx-auto flex flex-col">
        <div className="flex flex-wrap -m-4">
          {product.tiers.map((tier, index) => (
            <>
              <div className="p-4 xl:w-1/4 md:w-1/2 w-full">
                <div
                  className={`${
                    (tier.popular && !showCurrentPlan) ||
                    (props.currentPlanIndexOverride == index && !props.isDefaultFreeTrial)
                      ? "border-teal-500 border-4"
                      : "border-sky-700 dark:border-gray-300 border-2"
                  } h-full p-6 rounded-lg  flex flex-col relative overflow-hidden`}
                >
                  {((tier.popular && !showCurrentPlan) ||
                    props.currentPlanIndexOverride == index) && !props.isDefaultFreeTrial && (
                    <span class="bg-teal-500 text-white font-semibold px-3 py-1 tracking-widest text-xs absolute right-0 top-0 rounded-bl">
                      {showCurrentPlan ? ("CURRENT PLAN") : "POPULAR"}
                    </span>
                  )}
                  <div className="text-lg tracking-widest font-medium">
                    {tier.name}
                  </div>
                  <h1
                    className={`${
                      tier.month ? "text-5xl pb-4" : "text-4xl pb-6"
                    }  text-sky-700 dark:text-sky-300  mb-4 border-b border-gray-200 leading-none`}
                  >
                    <span>{tier.price}</span>
                    {tier.month && (
                      <span class="text-lg ml-1 font-normal text-gray-500">
                        /mo
                      </span>
                    )}
                  </h1>
                  <div className="mb-5">
                    {tier.features.map((feature) => (
                      <p className="flex items-baseline text-anoteblack-200 mb-2">
                        <span className="w-4 h-4 mr-2 inline-flex items-center justify-center bg-sky-700  dark:bg-sky-500 text-white  rounded-full flex-shrink-0">
                          <svg
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2.5"
                            className="w-3 h-3"
                            viewBox="0 0 24 24"
                          >
                            <path d="M20 6L9 17l-5-5"></path>
                          </svg>
                        </span>
                        {feature}
                      </p>
                    ))}
                  </div>
                  <Button
                    className="relative justify-start"
                    onClick={() => {
                      buttonAction(
                        tier,
                        product,
                        props.isDefaultFreeTrial,
                        props.currentPlanIndexOverride,
                        showCurrentPlan,
                        index
                      );
                    }}
                  >
                    {buttonText(
                      tier,
                      product,
                      props.isDefaultFreeTrial,
                      props.currentPlanIndexOverride,
                      showCurrentPlan,
                      index
                    )}
                    {/* {(tier.price == "Contact us" || (product.forceContactUs == true)) ? "Contact us" :
                    (!showCurrentPlan ? "Sign Up" :
                      ((props.currentPlanIndexOverride == index) ? "Cancel" : "Sign Up")
                    )
                    } */}
                    <span className="absolute right-3">
                      <FontAwesomeIcon
                        icon={faArrowRight}
                        className="ml-2 w-5 h-5"
                      />
                    </span>
                  </Button>
                </div>
              </div>
            </>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
